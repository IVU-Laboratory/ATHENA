import * as vscode from 'vscode';
import { ChatbotPanel } from ".\\ChatbotPanel"; // Import the ChatbotPanel
import { SettingsWizardPanel } from './SettingsWizardPanel'; 
import { TriggerMode, DisplayMode } from "./utilities/settings";

import { CustomActionProvider } from './CustomActionProvider';
import { requestGPT4 } from './GPT';
import {InlineCompletionProvider} from "./InlineCompletionProvider";
import * as dotenv from 'dotenv';
import * as path from 'path';

let typingTimeout: NodeJS.Timeout | undefined;
let chatbotProvider: ChatbotPanel;

let proactiveCompletionListener: vscode.Disposable | undefined;  // The event listener for EVERY proactive suggestion method

let inlineCompletionDisposable: vscode.Disposable | undefined;  // The completion provider for the inline suggestions
let tooltipProactiveProvider: vscode.Disposable | undefined;  // The completion provider for the tooltip suggestions 

const extension_id = 'uniba.llm-code-completion';
const settingsName = "llmCodeCompletion";

let toggle_suggestions = true;
let providerInstance: InlineCompletionProvider | undefined;

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


export function activate(context: vscode.ExtensionContext) {
  console.log ("Starting LLM Code completion extension");
  loadSettings();  // Load settings into global variables
  let envPath = path.join(context.extensionPath, '.env');
  let env_loaded = dotenv.config({ path: envPath });  // Load .env file
  if (env_loaded.error) {
    console.log (`"Error loading the environment variables in .env file (${envPath})! OpenAI key must be set there!`);
  } else {
    console.log(`API Key: ${process.env.OPENAI_API_KEY}`);
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

  if (displayMode === DisplayMode.Inline && triggerMode === TriggerMode.Proactive) {
    registerInlineCompletionItemProvider(context);
  }
  
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

  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { scheme: '*'}, // Adjust for your language
    new CustomActionProvider(),
    { providedCodeActionKinds: CustomActionProvider.providedCodeActionKinds }
  );
  // Add the registration to the context's subscriptions
  context.subscriptions.push(codeActionProvider);

  // Register the "Resolve TODO" command
  const resolveTODOCommand = vscode.commands.registerCommand(
    'extension.resolveTODO',
    (document: vscode.TextDocument, range: vscode.Range) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const line = document.lineAt(range.start.line).text;
      const updatedLine = line.replace('TODO', 'Resolved'); // Replace "TODO" with "Resolved"

      editor.edit((editBuilder) => {
        editBuilder.replace(range, updatedLine);
      });
    }
  );

  // Add the command to the context's subscriptions
  context.subscriptions.push(resolveTODOCommand);
  
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


function registerInlineCompletionItemProvider(context: vscode.ExtensionContext) {
  console.log("Registering inline completion provider");
  // Register command to toggle inline suggestions
  const toggleCommand = vscode.commands.registerCommand('llmCodeCompletion.toggleInlineSuggestions', () => {
    if (inlineCompletionDisposable) {
      inlineCompletionDisposable.dispose();
      inlineCompletionDisposable = undefined;
      vscode.window.showInformationMessage('Inline suggestions disabled.');
    } else {
      providerInstance = new InlineCompletionProvider();
      inlineCompletionDisposable = vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' }, // tutti i file
        providerInstance
      );
      context.subscriptions.push(inlineCompletionDisposable);
      vscode.window.showInformationMessage('Inline suggestions enabled.');
    }
  });

  context.subscriptions.push(toggleCommand);
  triggerInlineSuggestions();
}


// Helper function to trigger inline suggestions in the active editor
function triggerInlineSuggestions() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  }
}

function registerDynamicShortcuts(context: vscode.ExtensionContext, shortcuts: any) {
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
  console.log("triggering suggestion with Display mode: " + displayMode);
  console.log("triggering suggestion with Trigger mode: " + triggerMode);
  if (!hasSufficientContext(document)) {
    return;
  }
  const contextText = extractContext(document, position);

  const suggestion = await getLLMSuggestion(contextText);

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    switch (displayMode) {
      case 'tooltip':  // this should only be called when the user asks for a suggestion (not proactively - for that, there is the completionProvider)
        console.log("Showing tooltip suggestion");
        showSuggestionInTooltip(editor, suggestion, position);
        break;
      case 'inline':
        console.log("Showing inline suggestion");
        //showInlineSuggestion(editor, suggestion, position);
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



function hasSufficientContext(document: vscode.TextDocument): boolean {
  const MIN_CONTEXT_LENGTH = 10;
  return document.getText().trim().length > MIN_CONTEXT_LENGTH;
}


function extractContext(document: vscode.TextDocument, position: vscode.Position): string {
  // Typing context for the LLM can be adjusted by indicating a range in getText()
  const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position)); 
  return text;
}


async function getLLMSuggestion(context: string): Promise<string> {
  let prompt = "";
  prompt = includeDocumentation
      ? `Provide a suggestion with documentation based on the context: ${context}`
      : `Provide a suggestion based on the context: ${context}`;
  

  // Call the LLM API instead of the placeholder suggestion
  let suggestion = await requestGPT4(prompt);
  return suggestion;

  //let suggestion = new Promise<string>((resolve) => {
  //    setTimeout(() => {
  //      resolve(`// LLM suggestion based on granularity level ${suggestionGranularity}`); // TODO this is a placeholder for the LLM API call
  //    vscode.window.showInformationMessage;
  //    }, 1000);
  //  }
  //);
  // Maybe the documentation might be asked within the prompt, so that getLLMSuggestion would take "includeDocumentation" as an input parameter and change the LLM prompt accordingly
  //let enrichedSuggestion = suggestion;
  //if (includeDocumentation) {
  //  enrichedSuggestion = enrichSuggestionWithDocumentation(await suggestion);
  //}
  //return enrichedSuggestion;
}


async function enrichSuggestionWithDocumentation(suggestion: string): Promise<string> {
  //TODO get documentation references for functions in suggestion
  return suggestion + `\n\n// Documentation references included.`;
}


/* Suggestion showing functions */
async function showSuggestionInTooltip(editor: vscode.TextEditor, suggestion: string, position: vscode.Position){
  if (triggerMode === TriggerMode.OnDemand) {
    console.log("showing tooltip suggestion on demand");
    // Create a temporary item completion provider for the tooltip suggestion 
    let disposable = getTooltipCompletionProvider();
      
    const items = getCompletionItemsWithLLMSuggestion(suggestion);
    // Insert the first suggestion manually, or display the list if needed
    if (items.length > 0) {
      //editor.insertSnippet(new vscode.SnippetString(items[0].insertText as string), position);
      await vscode.commands.executeCommand('editor.action.triggerSuggest');
    }

    // Dispose of the provider when the user starts typing again or changes focus
    const editorDisposable = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === editor.document) {
        disposable.dispose();
        editorDisposable.dispose(); // Cleanup the event listener
      }
    });
    // Also dispose of the provider when the editor loses focus (e.g., the dropdown is dismissed)
    const focusDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
      disposable.dispose();
      focusDisposable.dispose(); // Cleanup the focus listener
    });
  } else {
    console.log("showing tooltip suggestion proactively");
    const items = getCompletionItemsWithLLMSuggestion(suggestion);
    if (items.length > 0) {
      await vscode.commands.executeCommand('editor.action.triggerSuggest');
    }
  } 
}


// Inline suggestion TODO: probabilmente dovremo usare gli InlineCompletionProvider https://code.visualstudio.com/api/references/vscode-api#3414
/* 
function showInlineSuggestion(editor: vscode.TextEditor, suggestion: string, position: vscode.Position) {
  if (currentDecorationType) {
    currentDecorationType.dispose();
    vscode.commands.executeCommand('setContext', 'inlineSuggestionVisible', false);
  }

  // Create a new decoration type for the inline suggestion
  currentDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: suggestion,
      color: 'gray',
      fontStyle: 'italic',
    },
  });

  currentSuggestion = suggestion;
  currentPosition = position;

  position = position.translate(0, 4);
  const range = new vscode.Range(position, position);
  editor.setDecorations(currentDecorationType, [{ range }]);
  vscode.commands.executeCommand('setContext', 'inlineSuggestionVisible', true);
}

function showInlineSuggestionItem(editor: vscode.TextEditor, suggestion: string, position: vscode.Position) {
    let completionItem = new vscode.InlineCompletionItem(suggestion);
}
*/



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


// Tooltip Suggestion
function getCompletionItemsWithLLMSuggestion(llmSuggestion: string): vscode.CompletionItem[] {
  const items: vscode.CompletionItem[] = [];

  // LLM-generated suggestion (custom completion item)
  const llmCompletionItem = new vscode.CompletionItem(llmSuggestion, vscode.CompletionItemKind.Snippet);
  
  llmCompletionItem.insertText = llmSuggestion;
  llmCompletionItem.detail = "✨AI-Generated";
  llmCompletionItem.sortText = "000"; // Ensures this item appears at the top
  llmCompletionItem.documentation = new vscode.MarkdownString("This suggestion is generated by an LLM.");

  // Add LLM suggestion as the first item
  items.push(llmCompletionItem);
  return items;
}

function registerTooltipCompletionProvider() {
  if (tooltipProactiveProvider === undefined) {
    console.log("Registering tooltip completion provider");
    tooltipProactiveProvider = getTooltipCompletionProvider();
  } else {
    console.log("Tooltip completion provider is already registered.");
  }
}

function unregisterTooltipCompletionProvider() {
  if (tooltipProactiveProvider) {
    console.log("Unregistering tooltip completion provider");
    tooltipProactiveProvider.dispose(); // Dispose of the provider
    tooltipProactiveProvider = undefined; // Clear the reference
  }
}

function getTooltipCompletionProvider(): vscode.Disposable {
  /* Returns a completion item provider for the tooltip suggestions */
  const tooltipProactiveProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file' }, // Enable for all file-based languages
    {
      provideCompletionItems(document, position, token, completionContext) {
        return new Promise<vscode.CompletionItem[]>((resolve) => {
          // Clear any existing timeout
          if (typingTimeout) {
            clearTimeout(typingTimeout);
          }

          // Start a new typing timeout
          typingTimeout = setTimeout(async () => {
            try {
              // Check if sufficient context is available
              if (hasSufficientContext(document)) {
                console.log("Calling tooltip completion inside provider");

                // Extract context and get LLM suggestions
                const typingContext = extractContext(document, position);
                const llmSuggestion = await getLLMSuggestion(typingContext);

                // Convert suggestions to completion items
                const items = getCompletionItemsWithLLMSuggestion(llmSuggestion);
                resolve(items);
              } else {
                resolve([]); // Return empty array if insufficient context
              }
            } catch (error) {
              console.error("Error in tooltip completion provider:", error);
              resolve([]); // Return empty array in case of error
            }
          }, 2000); // 2-second delay
        });
      },
    }, // if proactive, show the tooltip suggestion when the user types any character 
    // ...[".", ",", ";", "[", "(", "{", ":", "\n"] // Trigger on typing different characters.
  ); 
  return tooltipProactiveProvider;
}


/* ------------------ */

function onConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
  console.log(`Configuration changed. \n- triggerMode changed? ${event.affectsConfiguration('llmCodeCompletion.triggerMode')} \n- displayMode changed? ${event.affectsConfiguration('llmCodeCompletion.displayMode')}`);
  if(event.affectsConfiguration('llmCodeCompletion.triggerMode') || event.affectsConfiguration('llmCodeCompletion.displayMode') || event.affectsConfiguration('llmCodeCompletion.suggestionGranularity') || event.affectsConfiguration('llmCodeCompletion.includeDocumentation') || event.affectsConfiguration('llmCodeCompletion.inlineMaxLength')){
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
      // Register the completion provider with LLM suggestion for PROACTIVE tooltip display
      registerTooltipCompletionProvider();
  }
}


function disableProactiveBehavior() {
  proactiveCompletionListener?.dispose();
  clearTimeout(typingTimeout); // Set the typing timeout to undefined to prevent proactive behavior
  unregisterTooltipCompletionProvider();  // unregister tooltip completion provider if exists
}


/* --------- */

export function deactivate() {  // this function is probably deprecated 
  if (inlineCompletionDisposable) {
    inlineCompletionDisposable.dispose();
  }
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
}


function loadSettings() {
  // Automatically update global parameters from settings
  /* 
  triggerMode = config.get<TriggerMode>('triggerMode', 'onDemand');
  displayMode = config.get<DisplayMode>('displayMode', 'inline');
  suggestionGranularity = config.get<number>('suggestionGranularity', suggestionGranularity);
  includeDocumentation = config.get<boolean>('includeDocumentation', includeDocumentation);
  // inlineMaxLength = config.get<number>('inlineMaxLength', inlineMaxLength);*/

  const config = vscode.workspace.getConfiguration('llmCodeCompletion');

  var dm = config.get('displayMode', 'inline'); // Default is 'inline'
  var tm = config.get('triggerMode', 'proactive'); // Default is 'proactive'
  switch(dm){
    case ("inline"):
      displayMode = DisplayMode.Inline;
      break;
    case ("tooltip"):
      displayMode = DisplayMode.Tooltip;
      break;  
    case ("sideWindow"):
      displayMode = DisplayMode.SideWindow;
      break;
    case ("hybrid"):
      displayMode = DisplayMode.Hybrid;
  }
  switch(tm){
    case ("proactive"):
      triggerMode = TriggerMode.Proactive;
      break;
    case ("onDemand"):
      triggerMode = TriggerMode.OnDemand;
  }
  
  suggestionGranularity = config.get('suggestionGranularity', 5); // Default is 5
  includeDocumentation = config.get('includeSources', false); // Default is false

  shortcuts = {
    toggleSuggestion: config.get('shortcuts.toggleSuggestion', 'ctrl+alt+s'),
    triggerSuggestion: config.get('shortcuts.triggerSuggestion', 'ctrl+alt+r'),
    openSettings: config.get('shortcuts.openSettings', 'ctrl+alt+t'),
    openChatbot: config.get('shortcuts.openChatbot', 'ctrl+alt+p'),
  };
  console.log(`Settings loaded:\nDisplay mode = ${displayMode}\nTrigger mode = ${triggerMode}\nSuggestion granularity = ${suggestionGranularity}\n`);

  return { displayMode, triggerMode, suggestionGranularity, includeDocumentation, shortcuts };
}
