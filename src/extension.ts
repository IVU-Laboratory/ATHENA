import * as vscode from 'vscode';
import { ChatbotPanel } from ".\\ChatbotPanel"; // Import the ChatbotPanel

let typingTimeout: NodeJS.Timeout | undefined;
let chatbotProvider: ChatbotPanel;

const extension_id = 'uniba.llm-code-completion'
const settingsName = "llmCodeCompletion";
const inlineMaxLength = 50;

// Default values for settings 
var triggerMode = "proactive";
var displayMode = 'tooltip';
var suggestionGranularity = 5;
var includeDocumentation = false;
var triggerShortcut;  //TODO set a trigger shortcut to be used in the reactive trigger mode

export function activate(context: vscode.ExtensionContext) {
  // Try to set the values from the settings 
  updateSettings();

  if (triggerMode === 'proactive') {
    vscode.workspace.onDidChangeTextDocument(onTextChanged);
  }

  if (displayMode == "tooltip") {
      
    console.log("registering completion item provider");
    // Register the completion provider with LLM suggestion for tooltip display
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
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
                  let typingContext = extractContext(document, position);
                  const items = await getCompletionItemsWithLLMSuggestion(typingContext);
                  resolve(items);
                } else {
                  resolve([]); // Return empty array if there's insufficient context
                }
              }, 2000); // Delay for 2000ms (2 seconds)
            });
          },
        },
        ".", ",", ";", "[", "(", "{" // Trigger on typing different characters. TODO: Remove them completely to activate a suggestion on any character typed => DOESN'T WORK! 
      )
    );
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
  /* DEBUG:
  context.subscriptions.push(
    vscode.commands.registerCommand('llmCodeCompletion.showConfigParameters', () => {
      let entire_config = vscode.workspace.getConfiguration();
      console.log("Entire Configuration object:", entire_config);

      let config = vscode.workspace.getConfiguration("llmCodeCompletion");
      console.log("Extension Configuration object (llmCodeCompletion):", config);
    })
  )*/
	/* -----------  */
}


// Helper debounce function
function debounce<T extends (...args: any[]) => Promise<vscode.CompletionItem[]>>(func: T, wait: number) {
  let timeout: NodeJS.Timeout;
  let resultPromise: Promise<vscode.CompletionItem[]> | undefined;

  return (...args: Parameters<T>): Promise<vscode.CompletionItem[]> => {
    clearTimeout(timeout);
    timeout = setTimeout(() => (resultPromise = func(...args)), wait);
    return resultPromise || func(...args);
  };
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

  const suggestion = await getLLMSuggestion(contextText, suggestionGranularity);
  // TODO: Probably the documentation should be asked within the prompt, so getLLMSuggestion might take in 
  // input "includeDocumentation" as a parameter and change the prompt to the LLM accordingly
  let enrichedSuggestion = suggestion;
  if (includeDocumentation) {
    enrichedSuggestion = enrichSuggestionWithDocumentation(suggestion);
  }

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    switch (displayMode) {
      case 'tooltip':  // the tooltip containing the completion is already shown by the CompetionItemProvider
        break;
      case 'inline':
        showInlineSuggestion(editor, enrichedSuggestion, position);
        break;
      case 'sideWindow':
        showSuggestionInSideWindow(enrichedSuggestion);
        break;
      case 'chatbot':
        showSuggestionInChatbot(enrichedSuggestion);
        break;
      case 'hybrid': 
        if (enrichedSuggestion.length <= inlineMaxLength) {
          showInlineSuggestion(editor, enrichedSuggestion, position);
        } else {
          showSuggestionInChatbot(enrichedSuggestion)
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

async function getLLMSuggestion(context: string, granularity: number): Promise<string> {
  // TODO Placeholder for LLM API call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`// LLM suggestion based on granularity level ${granularity}`);
	  vscode.window.showInformationMessage;
    }, 1000);
  });
}


function enrichSuggestionWithDocumentation(suggestion: string): string {
  return suggestion + `\n\n// Documentation references included.`;
}


function onConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
  if (event.affectsConfiguration('llmCodeCompletion.triggerMode')) {
    const config = vscode.workspace.getConfiguration(settingsName);
    const triggerMode = config.get<string>('triggerMode', 'proactive');

    if (triggerMode === 'proactive') {
      vscode.workspace.onDidChangeTextDocument(onTextChanged);
    } else {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = undefined;
      }
    }
  }
}


/* Suggestion showing functions */
// Inline suggestion
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
async function getCompletionItemsWithLLMSuggestion(typingContext: string): Promise<vscode.CompletionItem[]> {
  console.log("Showing suggestion in tooltip: "); 
  const items: vscode.CompletionItem[] = [];

  // LLM-generated suggestion (custom completion item)
  const llmSuggestion = await getLLMSuggestion(typingContext, suggestionGranularity); 
  console.log(llmSuggestion);
  const llmCompletionItem = new vscode.CompletionItem(llmSuggestion, vscode.CompletionItemKind.Snippet);
  
  llmCompletionItem.insertText = llmSuggestion;
  llmCompletionItem.detail = "Generated by LLM";
  llmCompletionItem.sortText = "000"; // Ensures this item appears at the top
  llmCompletionItem.documentation = new vscode.MarkdownString("This suggestion is generated by an AI model.");

  /* Set the icon for the LLM suggestion
  const iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'ai_icon.png');
  llmCompletionItem.iconPath = {
    light: iconPath,
    dark: iconPath
  };*/

  // Add LLM suggestion as the first item
  items.push(llmCompletionItem);
  return items;
  /* Let VS Code provide the remaining IntelliSense suggestions
  const defaultItems = await vscode.commands.executeCommand<vscode.CompletionItem[]>(
    'vscode.executeCompletionItemProvider',
    vscode.window.activeTextEditor!.document.uri,
    vscode.window.activeTextEditor!.selection.active
  );

  return defaultItems
    ? items.concat(defaultItems)
    : items;*/
}


/* Function to show a suggestion as a completion popup under the text cursor
export function showSuggestionInTooltip(editor: vscode.TextEditor, suggestion: string, position: vscode.Position) {
  const provider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: editor.document.languageId },
    {
      provideCompletionItems(document, position, token, context) {
        const completionItem = new vscode.CompletionItem(suggestion, vscode.CompletionItemKind.Snippet);
        completionItem.insertText = suggestion;
        completionItem.detail = "LLM Suggestion";
        completionItem.documentation = new vscode.MarkdownString("This is a suggestion generated by the LLM.");
        return [completionItem];
      }
    },
    '' // Empty string as the trigger character, so the suggestion appears without any specific trigger
  );

  // Trigger the completion list manually
  vscode.commands.executeCommand('editor.action.triggerSuggest');

  // Dispose of the provider after a short delay to avoid keeping it active indefinitely
  setTimeout(() => {
    provider.dispose();
  }, 3000); // Show the suggestion for 3 seconds
}*/

/* Updates the parameters based on the settings specified by the user (or by default) */
export function updateSettings(){
  const config = vscode.workspace.getConfiguration(settingsName);
  triggerMode = config.get<string>('triggerMode', triggerMode);
  displayMode = config.get<string>('displayMode', displayMode);
  suggestionGranularity = config.get<number>('suggestionGranularity', suggestionGranularity);
  includeDocumentation = config.get<boolean>('includeDocumentation', includeDocumentation);
}


/* --------- */

export function deactivate() {
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
}
