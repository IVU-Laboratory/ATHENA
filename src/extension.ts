import * as vscode from 'vscode';
import { ChatbotPanel } from ".\\ChatbotPanel"; // Import the ChatbotPanel
import { TriggerMode, DisplayMode } from "./utilities/settings";

let typingTimeout: NodeJS.Timeout | undefined;
let chatbotProvider: ChatbotPanel;

const extension_id = 'uniba.llm-code-completion';
const settingsName = "llmCodeCompletion";

// Default values for settings 
var triggerMode = TriggerMode.OnDemand;
var displayMode = DisplayMode.Tooltip;
var suggestionGranularity = 5;  // 1-10, indicates the granularity of the suggestion
var includeDocumentation = true;  // Can be true or false to include or not the documentation in the suggestion
var inlineMaxLength = 50;  // only works when displayMode="hybrid". Defines the maximum length of suggestions to be shown inline 
// var triggerShortcut = "ctrl+alt+s"; //this is already defined in the package.json file 

var tooltipProactiveProvider: vscode.Disposable;  // The completion provider for the tooltip suggestions 

export function activate(context: vscode.ExtensionContext) {
  console.log ("Starting LLM Code completion extension");
  updateSettings();  // Set the values from the settings 

  if (triggerMode === 'proactive') {
    vscode.workspace.onDidChangeTextDocument(onTextChanged);

    if (displayMode === "tooltip") {
      // Register the completion provider with LLM suggestion for PROACTIVE tooltip display
      registerCompletionProvider();
    }
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
			ChatbotPanel.createOrShow(context.extensionUri);
		})
  );

  vscode.workspace.onDidChangeConfiguration(onConfigurationChanged); 
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



async function triggerSuggestion(document: vscode.TextDocument, position: vscode.Position) {
  // Generate suggestions only if there is sufficient context 
  if (!hasSufficientContext(document)) {
    return;
  }
  const contextText = extractContext(document, position);

  const suggestion = await getLLMSuggestion(contextText);

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    switch (displayMode) {
      case 'tooltip':  // this should only be called when the user asks for a suggestion (not proactively - for that, there is the completionProvider)
        showSuggestionInTooltip(editor, suggestion, position);
        break;
      case 'inline':
        showInlineSuggestion(editor, suggestion, position);
        break;
      case 'sideWindow':
        showSuggestionInSideWindow(suggestion);
        break;
      case 'chatbot':
        showSuggestionInChatbot(suggestion);
        break;
      case 'hybrid': 
        if (suggestion.length <= inlineMaxLength) {
          showInlineSuggestion(editor, suggestion, position);
        } else {
          showSuggestionInSideWindow(suggestion);
        }
        break;
    }
  }
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
  let suggestion = new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve(`// LLM suggestion based on granularity level ${suggestionGranularity}`); // TODO this is a placeholder for the LLM API call
      vscode.window.showInformationMessage;
      }, 1000);
    }
  );
  // Maybe the documentation might be asked within the prompt, so that getLLMSuggestion would take "includeDocumentation" as an input parameter and change the LLM prompt accordingly
  let enrichedSuggestion = suggestion;
  if (includeDocumentation) {
    enrichedSuggestion = enrichSuggestionWithDocumentation(await suggestion);
  }
  return enrichedSuggestion;
}


async function enrichSuggestionWithDocumentation(suggestion: string): Promise<string> {
  //TODO get documentation references for functions in suggestion
  return suggestion + `\n\n// Documentation references included.`;
}


/* Suggestion showing functions */
async function showSuggestionInTooltip(editor: vscode.TextEditor, suggestion: string, position: vscode.Position){
  console.log("Showing tooltip suggestion (on-demand)");
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
}


// Inline suggestion TODO: probabilmente dovremo usare gli InlineCompletionProvider https://code.visualstudio.com/api/references/vscode-api#3414
function showInlineSuggestion(editor: vscode.TextEditor, suggestion: string, position: vscode.Position) {
  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: suggestion,
      color: 'gray',
      fontStyle: 'italic',
    },
  });

  position = position.translate(0, 4);
  const range = new vscode.Range(position, position);
  editor.setDecorations(decorationType, [{ range }]);
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
  panel.webview.html = `<html><body><pre>${suggestion}</pre></body></html>`;
}


// Chatbot suggestion
export function showSuggestionInChatbot(suggestion: string) {
	vscode.window.showInformationMessage(suggestion)
  ChatbotPanel.createOrShow(vscode.extensions.getExtension(extension_id)!.extensionUri);
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


function registerCompletionProvider() {
  tooltipProactiveProvider = getTooltipCompletionProvider();
  //context.subscriptions.push(tooltipProactiveProvider);
}

function unregisterCompletionProvider() {
  tooltipProactiveProvider.dispose();
}


/* Returns a completion item provider for the tooltip suggestions */
function getTooltipCompletionProvider(): vscode.Disposable {
  const tooltipProactiveProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file' }, // Enable for all file-based languages
    {
      provideCompletionItems(document, position, token, completionContext) {
        // Clear any existing typing timeout
        if (typingTimeout) {
          clearTimeout(typingTimeout);
        }
        // Return a Promise that resolves after a delay
        return new Promise<vscode.CompletionItem[]>((resolve) => {
          // Start a new typing timeout
          typingTimeout = setTimeout(async () => {
            if (hasSufficientContext(document)) {
              // Get the LLM suggestion and show them as items in the completion dropdown
              let typingContext = extractContext(document, position);
              let llmSuggestion = await getLLMSuggestion(typingContext);
              const items = getCompletionItemsWithLLMSuggestion(llmSuggestion);
              resolve(items);
            } else {
              resolve([]); // Return empty array if there's insufficient context
            }
          }, 2000); // Delay for 2000ms (2 seconds)
        });
      },
    }, // if proactive, show the tooltip suggestion when the user types any character 
    // ...[".", ",", ";", "[", "(", "{", ":", "\n"] // Trigger on typing different characters.
  ); 
  return tooltipProactiveProvider;
}


/* ------------------ */

function onConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
  updateSettings();
  if (event.affectsConfiguration('llmCodeCompletion.triggerMode')) {
    console.log(`Trigger mode changed to ${triggerMode}`);
    if (triggerMode === 'proactive') {
      vscode.workspace.onDidChangeTextDocument(onTextChanged);
      registerCompletionProvider();
    } else {
      unregisterCompletionProvider();
      // Set the typing timeout to undefined to prevent proactive behavior FIXME: doesn't work!
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = undefined;
      }
    }
  }
}

/* Updates the global parameters based on the settings specified by the user (or by default) */
export function updateSettings(){
  const config = vscode.workspace.getConfiguration(settingsName);
  triggerMode = config.get<TriggerMode>('triggerMode', triggerMode);
  displayMode = config.get<DisplayMode>('displayMode', displayMode);
  suggestionGranularity = config.get<number>('suggestionGranularity', suggestionGranularity);
  includeDocumentation = config.get<boolean>('includeDocumentation', includeDocumentation);
  inlineMaxLength = config.get<number>('inlineMaxLength', inlineMaxLength);
}

/* --------- */

export function deactivate() {
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
}
