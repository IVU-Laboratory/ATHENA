import * as vscode from 'vscode';
import { ChatbotPanel } from ".\\ChatbotPanel"; // Import the ChatbotPanel
import { SettingsWizardPanel } from './SettingsWizardPanel'; 
import { TriggerMode, DisplayMode } from "./utilities/settings";

import { CustomActionProvider } from './CustomActionProvider';
import { GPTSessionManager } from './GPT';
import { TooltipProviderManager } from './TooltipProviderManager';
import { InlineProviderManager } from './InlineProviderManager';
import {hasSufficientContext, extractContext} from './utilities/context';
import * as dotenv from 'dotenv';
import * as path from 'path';

let typingTimeout: NodeJS.Timeout | undefined;
let chatbotProvider: ChatbotPanel;

let proactiveCompletionListener: vscode.Disposable | undefined;  // The event listener for EVERY proactive suggestion method

let InlineCompletionManager: InlineProviderManager;  // The completion provider for the inline suggestions
let TooltipCompletionManager: TooltipProviderManager ;  // The completion provider for the tooltip suggestions 

const extension_id = 'uniba.llm-code-completion';
const settingsName = "llmCodeCompletion";

let toggle_suggestions = true;

let currentDecorationType: vscode.TextEditorDecorationType | null = null;
let currentSuggestion: string | null = null;
let currentPosition: vscode.Position | null = null;
// Default values for settings 
var triggerMode: TriggerMode;
var displayMode: DisplayMode;
var displayModeHybridShort: DisplayMode;
var displayModeHybridLong: DisplayMode;
var suggestionGranularity: number;  // 1-10, indicates the granularity of the suggestion
var includeDocumentation: boolean;  // Can be true or false to include or not the documentation in the suggestion
var inlineMaxLength = 50;  // only works when displayMode="hybrid". Defines the maximum length of suggestions to be shown inline
var commentsGranularity: number; 

var completionText: string;
var explanationText: string;

var toggleCompletionButton: vscode.TextEditorDecorationType;
var shortcuts = {};

var ExtensionContext: vscode.ExtensionContext;

var Sidepanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log ("Starting LLM Code completion extension");
  ExtensionContext = context;

  const hasRunWizard = context.globalState.get<boolean>('hasRunWizard', false);
  if (!hasRunWizard) {
    // Run the configuration wizard
    runConfigurationWizard();
  } else {
    loadSettings();  // Load settings into global variables
  }

  let envPath = path.join(context.extensionPath, '.env');
  let env_loaded = dotenv.config({ path: envPath });  // Load .env file
  if (env_loaded.error) {
    console.log (`"Error loading the environment variables in .env file (${envPath})! OpenAI key must be set there!`);
  }
/*
   // Check if it's the first run
   const firstRunKey = 'llmCodeCompletion.firstRun';
   const globalState = context.globalState;
   const isFirstRun = !globalState.get(firstRunKey, false);
 
   if (isFirstRun) {
    console.log("First time using the extension. Opening Settings Wizard.");
    const conf = vscode.workspace.getConfiguration('llmCodeCompletion');
    const defaultShortcuts = {
      toggleSuggestion: 'Ctrl+Alt+S',
      triggerSuggestion: 'Ctrl+Alt+R',
      openSettings: 'Ctrl+Alt+T',
      openChatbot: 'Ctrl+Alt+P',
    };

    Object.keys(defaultShortcuts).forEach((key) => {
      const currentValue = conf.get(`shortcuts.${key}`);
      console.log(`Current value for ${key}: ${currentValue}`);
      // Only set the default shortcut if it hasn't been set already
      if (!currentValue) {
        conf.update(`shortcuts.${key}`, defaultShortcuts[key as keyof typeof defaultShortcuts], vscode.ConfigurationTarget.Global);
        console.log(`Setting default shortcut for ${key}: ${defaultShortcuts[key as keyof typeof defaultShortcuts]}`);
      } else {
        console.log(`Shortcut for ${key} already exists: ${currentValue}`);
      }
    });


    globalState.update(firstRunKey, true);
    SettingsWizardPanel.createOrShow(context.extensionUri);
  
      // Mark the first run as complete
    globalState.update(firstRunKey, true);
   }


  //const openSettingsCommand = vscode.commands.registerCommand('llmCodeCompletion.openSettingsWizard', () => {
   // SettingsWizardPanel.createOrShow(context.extensionUri); // Open the settings wizard
  //});
  //context.subscriptions.push(openSettingsCommand);
  const settings = loadSettings();
  registerDynamicShortcuts(context, settings.shortcuts);*/
  // Initialize the session with GPT-4o

  let openAIapikey = getOpenAIAPIkey();
  GPTSessionManager.initialize(openAIapikey)
  TooltipCompletionManager = new TooltipProviderManager(); 
  InlineCompletionManager = new InlineProviderManager(); 
  if (triggerMode === TriggerMode.Proactive) {
    enableProactiveBehavior();
  }

  completionText ='';
  explanationText = '';

	/* Register commands */
  context.subscriptions.push(
    vscode.commands.registerCommand('llmCodeCompletion.triggerSuggestion', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const document = editor.document;
        const position = editor.selection.active;
        await triggerSuggestion(document, position);
      }
    })
  );

	// Register the command to open the chatbot panel
	context.subscriptions.push(
		vscode.commands.registerCommand('llmCodeCompletion.showChatbot', () => {
      const editor = vscode.window.activeTextEditor;
      
      var documentText= "";
      if (editor) {
        documentText = editor.document.getText();
      }
      
			ChatbotPanel.createOrShow(context.extensionUri, documentText);
		})
  );  
   
  context.subscriptions.push(
    vscode.commands.registerCommand('llmCodeCompletion.toggleAutomaticSuggestions', () => {
      if (triggerMode == TriggerMode.Proactive) {
        disableProactiveBehavior();
        vscode.window.showInformationMessage('Automatic suggestions disabled.');
      } else {
        enableProactiveBehavior();
        vscode.window.showInformationMessage('Automatic suggestions enabled.');
      }
    })
  );

  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { scheme: '*'}, // Adjust for your language
    new CustomActionProvider(),
    { providedCodeActionKinds: CustomActionProvider.providedCodeActionKinds }
  );

  context.subscriptions.push(vscode.commands.registerCommand('llmCodeCompletion.openSettingsWizard', 
    runConfigurationWizard));
  
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.explainCode', (selectedText: string) => {
      GPTSessionManager.getLLMExplanation(selectedText, "what").then(explanation => {
        showSuggestionInSideWindow("", explanation);
      });
    })
  );

  // Register the "Why this code?" command
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.whyThisCode', (selectedText: string) => {
      GPTSessionManager.getLLMExplanation(selectedText, "why").then(explanation => {
        showSuggestionInSideWindow("", explanation);
      });
    })
  );
  
  vscode.workspace.onDidChangeConfiguration(onConfigurationChanged);  // Update settings automatically on change.
  displayMode = DisplayMode.SideWindow
  //addButtonsToEditor(context); NON FUNZIONA
}
  

/* Callback used by the editor for proactive code completion */
function onTextChanged(event: vscode.TextDocumentChangeEvent) {
  const idleTime = 2000; // show suggestion after 2 seconds
  const document = event.document;

  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }

  typingTimeout = setTimeout(() => {
    if (hasSufficientContext(document)) {
      const position = event.contentChanges[0]?.range.end || new vscode.Position(0, 0);
      triggerSuggestion(document, position); 
    }
  }, idleTime);
}


function registerDynamicShortcuts(context: vscode.ExtensionContext, shortcuts: any) {
  //TODO
  const { toggleSuggestion, triggerSuggestion, openSettings, openChatbot } = shortcuts;

  // Register each command with its respective shortcut
  const keybindings = [
    { command: 'llmCodeCompletion.toggleSuggestion', keybinding: toggleSuggestion },
    { command: 'llmCodeCompletion.triggerSuggestion', keybinding: triggerSuggestion },
    { command: 'llmCodeCompletion.openSettingsWizard', keybinding: openSettings },
    { command: 'llmCodeCompletion.showChatbot', keybinding: openChatbot },
  ];

  keybindings.forEach(({ command, keybinding }) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, () => {
      vscode.commands.executeCommand(command);
    }));

    vscode.commands.executeCommand('setContext', command, keybinding);
    console.log(`Registered shortcut: ${keybinding} for ${command}`);
  });
}



async function triggerSuggestion(document: vscode.TextDocument, position: vscode.Position) {
  // Generate suggestions only if there is sufficient context 
  if (!hasSufficientContext(document)) {
    return;
  }
  //console.log("triggering suggestion with Display mode: " + displayMode);
  //console.log("triggering suggestion with Trigger mode: " + triggerMode);
  
  const contextText = extractContext(document, position);

  const suggestion = await GPTSessionManager.getLLMSuggestion(contextText, includeDocumentation, commentsGranularity);

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    switch (displayMode) {
      case 'tooltip':  // this should only be called when the user asks for a suggestion (not proactively - for that, there is the completionProvider)
        if (triggerMode != TriggerMode.Proactive) {
          console.log("Showing tooltip suggestion on demand");
          TooltipCompletionManager.provideOnDemandSuggestion(editor, suggestion, position);
        }  
        break;
      case 'inline':
        if (triggerMode != TriggerMode.Proactive) {
          console.log("Showing inline suggestion on demand");
          InlineCompletionManager.provideOnDemandSuggestion(editor, suggestion, position);
        }
        break;
      case 'sideWindow':
        console.log("Showing sidewindow suggestion");
        showSuggestionInSideWindow(suggestion, "");
        break;
      case 'chatbot':
        //showSuggestionInChatbot(suggestion,contextText);
        break;
      case 'hybrid': 
        if (suggestion.length <= inlineMaxLength) {
          // Short suggestion
          if (displayModeHybridShort == DisplayMode.Inline) {
            InlineCompletionManager.provideOnDemandSuggestion(editor, suggestion, position);
          } else if (displayModeHybridShort == DisplayMode.Tooltip) {
            TooltipCompletionManager.provideOnDemandSuggestion(editor, suggestion, position);
          }
        } else {
          // Long suggestion
          if (displayModeHybridLong == DisplayMode.SideWindow) {
            showSuggestionInSideWindow(suggestion, "");
          } else if (displayModeHybridLong == DisplayMode.Chatbot) {
            showSuggestionInChatbot(suggestion,contextText);
          }
        }
        break;
    }
  } else {
    console.log("No editor.");
  }
}


function addButtonsToEditor(context: vscode.ExtensionContext) {
  const visibleEditors = vscode.window.visibleTextEditors; 
  
  var editor: vscode.TextEditor;
  // Create decoration for the toggle button
  toggleCompletionButton = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ' [Suggestions: On/Off] ', // Button label
      backgroundColor: new vscode.ThemeColor('button.background'),
      color: new vscode.ThemeColor('button.foreground'),
      border: '1px solid',
      borderColor: new vscode.ThemeColor('button.border'),
      margin: '0 0 0 10px',
    },
});
  // Get the range for the first line
  for(editor of visibleEditors){
    const range = editor.document.lineAt(0).range;

  // Apply the decorations
    editor.setDecorations(toggleCompletionButton, [range]);
  }

 // editor.setDecorations(additionalFunctionButton, [range]);
}


function toggleAutoCompletion() {
  toggle_suggestions = !toggle_suggestions;
  

  // Update button text
  const newText = toggle_suggestions ? ' [Auto-Complete: On] ' : ' [Auto-Complete: Off] ';
  toggleCompletionButton.dispose();
  
}


function handleButtonClicks() {
  vscode.window.onDidChangeTextEditorSelection((event) => {
    const editor = event.textEditor;
    const cursorPosition = editor.selection.active;
    const extension_uri = vscode.extensions.getExtension(extension_id)!.extensionUri;
    // Get the first line's range
    const firstLineRange = editor.document.lineAt(0).range;

    // Check if the cursor is within the range of the toggle button
    if (cursorPosition.line === 0) {
      const cursorChar = cursorPosition.character;

      if (cursorChar >= firstLineRange.start.character && cursorChar <= firstLineRange.end.character + 20) {
        vscode.commands.executeCommand('llmCodeCompletion.toggleInlineSuggestions');
      } else if (cursorChar > firstLineRange.end.character + 20 && cursorChar <= firstLineRange.end.character + 40) {
        SettingsWizardPanel.createOrShow(extension_uri);
      }
    }
  });
}


// Lateral window suggestion 
function showSuggestionInSideWindow(suggestion: string, explanation: string) {

  explanationText += (explanationText ? '\n' : '') + explanation;
  completionText += (completionText ? '\n' : '') + suggestion;

  if (Sidepanel == null) {
    Sidepanel = vscode.window.createWebviewPanel(
      'codeSuggestion',
      'Code Suggestion',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
      }
    );
  }

  Sidepanel.webview.onDidReceiveMessage((message) => {
    switch (message.command) {
      case 'clearSuggestion':
        clearSuggestionPanel(); 
        break;
      case 'clearExplanation':
        clearExplanationPanel(); 
        break;
      default:
        console.warn(`Unknown command received: ${message.command}`);
    }
  });


 // Sidepanel.webview.html = `<html><body><pre style="text-wrap: wrap;">${suggestion}</pre></body></html>`;
 Sidepanel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Code Suggestions</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #1e1e1e; /* Dark grey background for the panel */
          color: #f0f0f0; /* Light text for readability */
        }
        .accordion {
          background-color: #2c2c2c; /* Slightly lighter grey for the panels */
          border: 1px solid #444;
          border-radius: 5px;
          margin: 0;
        }
        .accordion-header {
          padding: 10px;
          cursor: pointer;
          font-weight: bold;
          color: #ffffff; /* Bright text for header */
          background-color: #3a3a3a; /* Dark header background */
          border-bottom: 1px solid #555;
        }
        .accordion-header:hover {
          background-color: #444; /* Slightly brighter on hover */
        }
        .accordion-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease-out;
          padding: 0 10px;
          background-color: #2c2c2c;
        }
        .accordion-content.expanded {
          max-height: 300px; /* Adjust based on content size */
          padding: 10px;
        }
        pre {
          white-space: pre-wrap;
          word-wrap: break-word;
          font-size: 13px;
          line-height: 1.4;
          color: #d4d4d4; /* Softer light grey for text content */
        }
        button.clear-btn {
          margin-top: 10px;
          padding: 5px 10px;
          background-color: #d9534f; /* Bootstrap-like red button */
          color: #ffffff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button.clear-btn:hover {
          background-color: #c9302c; /* Slightly darker red on hover */
        }
      </style>
    </head>
    <body>
      <div class="accordion">
        <div class="accordion-header" onclick="toggleAccordion(this)">Code Suggestion</div>
        <div class="accordion-content">
          <pre id="suggestion-content">${suggestion}</pre>
          <button class="clear-btn" onclick="clearSuggestion()">Clear Completion</button>
        </div>
      </div>
      <div class="accordion">
        <div class="accordion-header" onclick="toggleAccordion(this)">Code Explanation</div>
        <div class="accordion-content">
          <pre id="explanation-content">${explanation}</pre>
          <button class="clear-btn" onclick="clearExplanation()">Clear Explanation</button>
        </div>
      </div>
      <script>
        // Toggle the accordion
        function toggleAccordion(header) {
          const content = header.nextElementSibling;
          if (content.classList.contains('expanded')) {
            content.classList.remove('expanded');
          } else {
            content.classList.add('expanded');
          }
        }

        // Clear the suggestion content
        function clearSuggestion() {
          const vscode = acquireVsCodeApi();
          vscode.postMessage({ command: 'clearSuggestion' });
        }

        // Clear the explanation content
        function clearExplanation() {
          const vscode = acquireVsCodeApi();
          vscode.postMessage({ command: 'clearExplanation' });
        }
      </script>
    </body>
    </html>
  `;
}

//functions to clear the side panel
function clearSidePanel(){
  completionText = '';
  explanationText = '';

  showSuggestionInSideWindow("","");
}

function clearSuggestionPanel(){
  completionText='';
  showSuggestionInChatbot("","");
}

function clearExplanationPanel(){
  explanationText='';
  showSuggestionInChatbot("","");
}

// Chatbot suggestion (potrebbe non servire)
export function showSuggestionInChatbot(suggestion: string, contextText: string) {
	vscode.window.showInformationMessage(suggestion);
  
  ChatbotPanel.createOrShow(vscode.extensions.getExtension(extension_id)!.extensionUri, contextText);
  ChatbotPanel.postMessage(suggestion);
}


/* ----------- Configuration related functions ------------ */

function onConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
  if(event.affectsConfiguration('llmCodeCompletion.triggerMode') || event.affectsConfiguration('llmCodeCompletion.displayMode') || event.affectsConfiguration('llmCodeCompletion.suggestionGranularity') || event.affectsConfiguration('llmCodeCompletion.includeDocumentation') || event.affectsConfiguration('llmCodeCompletion.inlineMaxLength')){
    console.log(`Configuration changed. \n- triggerMode changed? ${event.affectsConfiguration('llmCodeCompletion.triggerMode')} \n- displayMode changed? ${event.affectsConfiguration('llmCodeCompletion.displayMode')}`);
    loadSettings();
    //if (event.affectsConfiguration('llmCodeCompletion.triggerMode')) {
    if (triggerMode === TriggerMode.Proactive) {
      enableProactiveBehavior();
    } else {
      disableProactiveBehavior();
    }
  }
  if (event.affectsConfiguration('llmCodeCompletion.openaiAPIKey')) {  
    // set the openAI API key if it gets updated
    const new_api_key = getOpenAIAPIkey();
    if (new_api_key != "") {
      GPTSessionManager.initialize(new_api_key);
    }
  }
}


function getOpenAIAPIkey(): string {
  let key = "";
  // try to fetch the API key from the configurations 
  const config = vscode.workspace.getConfiguration('llmCodeCompletion');
  key = config.get<string>("openaiAPIKey", "");
  if (key == "") { 
    // try to fetch it from the .env file
    key = process.env.OPENAI_API_KEY ?? "";
  }
  return key;
}


async function enableProactiveBehavior() {
  proactiveCompletionListener = vscode.workspace.onDidChangeTextDocument(onTextChanged);
  if (displayMode === DisplayMode.Tooltip || (displayMode === DisplayMode.Hybrid && displayModeHybridShort === DisplayMode.Tooltip)) {
    // Register the completion provider for proactive tooltip display
    ExtensionContext.subscriptions.push(TooltipCompletionManager.enableProactiveBehavior());
  } else if (displayMode === DisplayMode.Inline ||  (displayMode === DisplayMode.Hybrid && displayModeHybridShort === DisplayMode.Inline)) {
    // Register the completion provider for proactive inline display
    ExtensionContext.subscriptions.push(InlineCompletionManager.enableProactiveBehavior());
  }
  // Ensure the triggerMode is updated
  if (triggerMode == TriggerMode.OnDemand) {
    // Change the config to TriggerMode.Proactive
    const config = vscode.workspace.getConfiguration('llmCodeCompletion');
    await config.update('triggerMode', TriggerMode.Proactive, vscode.ConfigurationTarget.Global);
  }
}


async function disableProactiveBehavior() {
  proactiveCompletionListener?.dispose();
  clearTimeout(typingTimeout); // Set the typing timeout to undefined to prevent proactive behavior
  TooltipCompletionManager.disableProactiveBehavior();  // unregister tooltip completion provider if exists
  InlineCompletionManager.disableProactiveBehavior();  // unregister inline completion provider if exists
  // Ensure the triggerMode is updated
  if (triggerMode == TriggerMode.Proactive) {
    // Change the config to TriggerMode.OnDemand
    const config = vscode.workspace.getConfiguration('llmCodeCompletion');
    await config.update('triggerMode', TriggerMode.OnDemand, vscode.ConfigurationTarget.Global);
  }
}


async function runConfigurationWizard() {
  const context = ExtensionContext;
  // Ask the user their programming level
  const programmingLevels = ['Beginner', 'Intermediate', 'Advanced'];
  let programmingLevel = await vscode.window.showQuickPick(programmingLevels, {
    placeHolder: 'LLM Code Completion extension configuration: Select your programming level...',
  });
  programmingLevel = programmingLevel?.toLowerCase();

  if (!programmingLevel) {
    // User canceled the wizard
    vscode.window.showInformationMessage('Setup canceled.');
    return;
  }

  // Update the default settings based on the chosen experience level
  setDefaultSettings(programmingLevel);

  // Show the editable settings
  /*vscode.window.showInformationMessage(
    `So you are ${programmingLevel == "beginner" ? "a" : "an"} ${programmingLevel} programmer. You can now customize your experience with the LLM code completion extension.`
  );*/
  vscode.commands.executeCommand('workbench.action.openSettings', 'llmCodeCompletion');  // Open the extension's settings panel

  // Mark the wizard as completed
  context.globalState.update('hasRunWizard', true);
}


async function setDefaultSettings(programmingLevel: string) {
  switch(programmingLevel){
    case 'beginner':
      triggerMode = TriggerMode.Proactive;
      displayMode = DisplayMode.Chatbot;
      includeDocumentation = true;
      suggestionGranularity = 5;
      break;
    case 'intermediate':
      triggerMode = TriggerMode.OnDemand;
      displayMode = DisplayMode.Hybrid;
      displayModeHybridShort = DisplayMode.Inline;
      displayModeHybridLong = DisplayMode.Chatbot;
      suggestionGranularity = 5;
      includeDocumentation = true;
      break;
    case 'advanced':
      triggerMode = TriggerMode.OnDemand;
      displayMode = DisplayMode.Hybrid;
      displayModeHybridShort = DisplayMode.Tooltip;
      displayModeHybridLong = DisplayMode.SideWindow;
      suggestionGranularity = 5;
      includeDocumentation = false;
      break;
  }
  // Update settings with default values
  const config = vscode.workspace.getConfiguration('llmCodeCompletion');
  await config.update('triggerMode', triggerMode, vscode.ConfigurationTarget.Global);
  await config.update('displayMode', displayMode, vscode.ConfigurationTarget.Global);
  await config.update('hybridModeShortSuggestions', displayModeHybridShort, vscode.ConfigurationTarget.Global);
  await config.update('hybridModeLongSuggestions', displayModeHybridLong, vscode.ConfigurationTarget.Global);
  await config.update('suggestionGranularity', suggestionGranularity, vscode.ConfigurationTarget.Global);
  await config.update('includeDocumentation', includeDocumentation, vscode.ConfigurationTarget.Global);
}


function loadSettings() {
  // Automatically update global parameters from settings
  const config = vscode.workspace.getConfiguration('llmCodeCompletion');
  triggerMode = config.get<TriggerMode>('triggerMode', TriggerMode.OnDemand);
  displayModeHybridShort = config.get<DisplayMode>('hybridModeShortSuggestions', DisplayMode.Inline);
  displayModeHybridLong = config.get<DisplayMode>('hybridModeLongSuggestions', DisplayMode.SideWindow);
  displayMode = config.get<DisplayMode>('displayMode', DisplayMode.Inline);
  suggestionGranularity = config.get<number>('suggestionGranularity', 5);  // Default is 5
  includeDocumentation = config.get<boolean>('includeDocumentation', false);  // Default is false
  // inlineMaxLength = config.get<number>('inlineMaxLength', inlineMaxLength);

  shortcuts = {
    toggleSuggestion: config.get('shortcuts.toggleSuggestion', 'ctrl+alt+s'),
    triggerSuggestion: config.get('shortcuts.triggerSuggestion', 'ctrl+alt+r'),

    openSettings: config.get('shortcuts.openSettings', 'ctrl+alt+t'),
    openChatbot: config.get('shortcuts.openChatbot', 'ctrl+alt+p'),
  };
  console.log(`Settings loaded:\nDisplay mode = ${displayMode}\nTrigger mode = ${triggerMode}\nSuggestion granularity = ${suggestionGranularity}\n`);
  
  // Dynamically shows/hides the hybrid parameters
  vscode.commands.executeCommand('setContext', 'llmCodeCompletion.showHybridConfigs', displayMode === DisplayMode.Hybrid);  //TODO: does not work

  return { displayMode, triggerMode, suggestionGranularity, includeDocumentation, shortcuts };
}
