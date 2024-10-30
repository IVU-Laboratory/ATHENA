import * as vscode from 'vscode';
import { ChatbotPanel } from ".\\ChatbotPanel"; // Import the ChatbotPanel

let typingTimeout: NodeJS.Timeout | undefined;
let chatbotProvider: ChatbotPanel;
const extension_id = 'uniba.llm-code-completion'
const settingsName = "llmCodeCompletion";

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration(settingsName);
  const triggerMode = config.get<string>('triggerMode', 'proactive');

  if (triggerMode === 'proactive') {
    vscode.workspace.onDidChangeTextDocument(onTextChanged);
  }

	/* Register commands */
  context.subscriptions.push(
    vscode.commands.registerCommand('llmCodeCompletion.triggerSuggestion', triggerSuggestionCommand)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llmCodeCompletion.showConfigParameters', () => {
      let entire_config = vscode.workspace.getConfiguration();
      console.log("Entire Configuration object:", entire_config);

      let config = vscode.workspace.getConfiguration("llmCodeCompletion");
      console.log("Extension Configuration object (llmCodeCompletion):", config);
    })
  )

	// Register the command to open the chatbot panel
	context.subscriptions.push(
		vscode.commands.registerCommand('llmCodeCompletion.showChatbot', () => {
			ChatbotPanel.createOrShow(context.extensionUri);
		})
	);
	/* -----------  */

  vscode.workspace.onDidChangeConfiguration(onConfigurationChanged);
}

function onTextChanged(event: vscode.TextDocumentChangeEvent) {
  const idleTime = 2000; // 2 seconds
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

async function triggerSuggestionCommand() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const document = editor.document;
    const position = editor.selection.active;
    await triggerSuggestion(document, position);
  }
}

async function triggerSuggestion(document: vscode.TextDocument, position: vscode.Position) {
  if (!hasSufficientContext(document)) {
    return;
  }

  const config = vscode.workspace.getConfiguration(settingsName);
  const displayMode = config.get<string>('displayMode', 'chatbot');
  const suggestionGranularity = config.get<number>('suggestionGranularity', 5);
  const includeDocumentation = config.get<boolean>('includeDocumentation', false);

  const contextText = extractContext(document, position);
  const suggestion = await getLLMSuggestion(contextText, suggestionGranularity);

  let enrichedSuggestion = suggestion;
  if (includeDocumentation) {
    enrichedSuggestion = enrichSuggestionWithDocumentation(suggestion);
  }

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    switch (displayMode) {
      case 'inline':
        showInlineSuggestion(editor, enrichedSuggestion, position);
        break;
      case 'sideWindow':
        showSuggestionInSideWindow(enrichedSuggestion);
        break;
      case 'chatbot':
        showSuggestionInChatbot(enrichedSuggestion);
        break;
    }
  }
}

function hasSufficientContext(document: vscode.TextDocument): boolean {
  const MIN_CONTEXT_LENGTH = 10;
  return document.getText().trim().length > MIN_CONTEXT_LENGTH;
}

function extractContext(document: vscode.TextDocument, position: vscode.Position): string {
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


/* --------- */

export function deactivate() {
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
}
