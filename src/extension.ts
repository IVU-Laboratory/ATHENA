import * as vscode from 'vscode';
import { ChatbotPanel } from ".\\ChatbotPanel"; // Import the ChatbotPanel
import { SettingsWizardPanel } from './SettingsWizardPanel'; 
import { TriggerMode, DisplayMode } from "./utilities/settings";
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
var suggestionGranularity: number;  // 1-10, indicates the granularity of the suggestion
var includeDocumentation: boolean;  // Can be true or false to include or not the documentation in the suggestion
var inlineMaxLength = 50;  // only works when displayMode="hybrid". Defines the maximum length of suggestions to be shown inline 

// var triggerShortcut = "ctrl+alt+s"; //this is already defined in the package.json file 
var toggleCompletionButton: vscode.TextEditorDecorationType;
var shortcuts = {};

var ExtensionContext: vscode.ExtensionContext;


export function activate(context: vscode.ExtensionContext) {
  console.log ("Starting LLM Code completion extension");
  ExtensionContext = context;
  loadSettings();  // Load settings into global variables
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
  GPTSessionManager.initialize(process.env.OPENAI_API_KEY ?? "")
  TooltipCompletionManager = new TooltipProviderManager(); 
  InlineCompletionManager = new InlineProviderManager(); 
  if (triggerMode === TriggerMode.Proactive) {
    enableProactiveBehavior();
  }

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

   // Register command to toggle proactive suggestions
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

  vscode.workspace.onDidChangeConfiguration(onConfigurationChanged);  // Update settings automatically on change.
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
      triggerSuggestion(document, position);  //COMMENTATA DA CESARE PER TESTARE IL COMPLETIONITEM 
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

  const suggestion = await GPTSessionManager.getLLMSuggestion(contextText, includeDocumentation);

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
        showSuggestionInSideWindow(suggestion);
        break;
      case 'chatbot':
        console.log("Showing chatbot suggestion");
        //showSuggestionInChatbot(suggestion,contextText);
        break;
      case 'hybrid': 
        if (suggestion.length <= inlineMaxLength) {
          //showInlineSuggestion(editor, suggestion, position);
        } else {
          showSuggestionInSideWindow(suggestion);
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
function showSuggestionInSideWindow(suggestion: string) {
  // TODO: do not create multiple panels => define one panel globally and check if it exists before creating it?
  const panel = vscode.window.createWebviewPanel(
    'codeSuggestion',
    'Code Suggestion',
    vscode.ViewColumn.Beside,
    {}
  );
  panel.webview.html = `<html><body><pre style="text-wrap: wrap;">${suggestion}</pre></body></html>`;
}


// Chatbot suggestion (potrebbe non servire)
export function showSuggestionInChatbot(suggestion: string, contextText: string) {
	vscode.window.showInformationMessage(suggestion);
  
  ChatbotPanel.createOrShow(vscode.extensions.getExtension(extension_id)!.extensionUri, contextText);
  ChatbotPanel.postMessage(suggestion);
}


/* ------------------ */

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
}


function enableProactiveBehavior() {
  proactiveCompletionListener = vscode.workspace.onDidChangeTextDocument(onTextChanged);
  if (displayMode === DisplayMode.Tooltip) {
    // Register the completion provider for proactive tooltip display
    ExtensionContext.subscriptions.push(TooltipCompletionManager.enableProactiveBehavior());
  } else if (displayMode === DisplayMode.Inline) {
    // Register the completion provider for proactive inline display
    ExtensionContext.subscriptions.push(InlineCompletionManager.enableProactiveBehavior());
  }
  // Ensure the triggerMode is updated
  if (triggerMode == TriggerMode.OnDemand) {
    // Change the config to TriggerMode.Proactive
  }
}


function disableProactiveBehavior() {
  proactiveCompletionListener?.dispose();
  clearTimeout(typingTimeout); // Set the typing timeout to undefined to prevent proactive behavior
  TooltipCompletionManager.disableProactiveBehavior();  // unregister tooltip completion provider if exists
  InlineCompletionManager.disableProactiveBehavior();  // unregister inline completion provider if exists
  // Ensure the triggerMode is updated
  if (triggerMode == TriggerMode.Proactive) {
    // Change the config to TriggerMode.OnDemand
  }
}


/* --------- */

function loadSettings() {
  // Automatically update global parameters from settings
  const config = vscode.workspace.getConfiguration('llmCodeCompletion');
  triggerMode = config.get<TriggerMode>('triggerMode', TriggerMode.OnDemand);
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

  return { displayMode, triggerMode, suggestionGranularity, includeDocumentation, shortcuts };
}
