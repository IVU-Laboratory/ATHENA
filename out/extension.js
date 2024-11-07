"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.showSuggestionInChatbot = showSuggestionInChatbot;
exports.updateSettings = updateSettings;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ChatbotPanel_1 = require(".\\ChatbotPanel"); // Import the ChatbotPanel
const settings_1 = require("./utilities/settings");
let typingTimeout;
let chatbotProvider;
const extension_id = 'uniba.llm-code-completion';
const settingsName = "llmCodeCompletion";
// Default values for settings 
var triggerMode = settings_1.TriggerMode.OnDemand;
var displayMode = settings_1.DisplayMode.Tooltip;
var suggestionGranularity = 5; // 1-10, indicates the granularity of the suggestion
var includeDocumentation = true; // Can be true or false to include or not the documentation in the suggestion
var inlineMaxLength = 50; // only works when displayMode="hybrid". Defines the maximum length of suggestions to be shown inline 
// var triggerShortcut = "ctrl+alt+s"; //this is already defined in the package.json file 
var tooltipProactiveProvider; // The completion provider for the tooltip suggestions 
function activate(context) {
    console.log("Starting LLM Code completion extension");
    updateSettings(); // Set the values from the settings 
    if (triggerMode === 'proactive') {
        vscode.workspace.onDidChangeTextDocument(onTextChanged);
        if (displayMode === "tooltip") {
            // Register the completion provider with LLM suggestion for PROACTIVE tooltip display
            registerCompletionProvider();
        }
    }
    /* Register commands */
    context.subscriptions.push(vscode.commands.registerCommand('llmCodeCompletion.triggerSuggestion', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const position = editor.selection.active;
            await triggerSuggestion(document, position);
        }
    }));
    // Register the command to open the chatbot panel
    context.subscriptions.push(vscode.commands.registerCommand('llmCodeCompletion.showChatbot', () => {
        ChatbotPanel_1.ChatbotPanel.createOrShow(context.extensionUri);
    }));
    vscode.workspace.onDidChangeConfiguration(onConfigurationChanged);
}
/* Callback used by the editor for proactive code completion */
function onTextChanged(event) {
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
async function triggerSuggestion(document, position) {
    // Generate suggestions only if there is sufficient context 
    if (!hasSufficientContext(document)) {
        return;
    }
    const contextText = extractContext(document, position);
    const suggestion = await getLLMSuggestion(contextText);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        switch (displayMode) {
            case 'tooltip': // this should only be called when the user asks for a suggestion (not proactively - for that, there is the completionProvider)
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
                }
                else {
                    showSuggestionInSideWindow(suggestion);
                }
                break;
        }
    }
}
function hasSufficientContext(document) {
    const MIN_CONTEXT_LENGTH = 10;
    return document.getText().trim().length > MIN_CONTEXT_LENGTH;
}
function extractContext(document, position) {
    // Typing context for the LLM can be adjusted by indicating a range in getText()
    const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    return text;
}
async function getLLMSuggestion(context) {
    let suggestion = new Promise((resolve) => {
        setTimeout(() => {
            resolve(`// LLM suggestion based on granularity level ${suggestionGranularity}`); // TODO this is a placeholder for the LLM API call
            vscode.window.showInformationMessage;
        }, 1000);
    });
    // Maybe the documentation might be asked within the prompt, so that getLLMSuggestion would take "includeDocumentation" as an input parameter and change the LLM prompt accordingly
    let enrichedSuggestion = suggestion;
    if (includeDocumentation) {
        enrichedSuggestion = enrichSuggestionWithDocumentation(await suggestion);
    }
    return enrichedSuggestion;
}
async function enrichSuggestionWithDocumentation(suggestion) {
    //TODO get documentation references for functions in suggestion
    return suggestion + `\n\n// Documentation references included.`;
}
/* Suggestion showing functions */
async function showSuggestionInTooltip(editor, suggestion, position) {
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
function showInlineSuggestion(editor, suggestion, position) {
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
function showSuggestionInSideWindow(suggestion) {
    // TODO: do not create multiple panels => define one panel globally and check if it exists before creating it?
    const panel = vscode.window.createWebviewPanel('codeSuggestion', 'Code Suggestion', vscode.ViewColumn.Beside, {});
    panel.webview.html = `<html><body><pre>${suggestion}</pre></body></html>`;
}
// Chatbot suggestion
function showSuggestionInChatbot(suggestion) {
    vscode.window.showInformationMessage(suggestion);
    ChatbotPanel_1.ChatbotPanel.createOrShow(vscode.extensions.getExtension(extension_id).extensionUri);
    ChatbotPanel_1.ChatbotPanel.postMessage(suggestion);
}
// Tooltip Suggestion
function getCompletionItemsWithLLMSuggestion(llmSuggestion) {
    const items = [];
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
function getTooltipCompletionProvider() {
    const tooltipProactiveProvider = vscode.languages.registerCompletionItemProvider({ scheme: 'file' }, // Enable for all file-based languages
    {
        provideCompletionItems(document, position, token, completionContext) {
            // Clear any existing typing timeout
            if (typingTimeout) {
                clearTimeout(typingTimeout);
            }
            // Return a Promise that resolves after a delay
            return new Promise((resolve) => {
                // Start a new typing timeout
                typingTimeout = setTimeout(async () => {
                    if (hasSufficientContext(document)) {
                        // Get the LLM suggestion and show them as items in the completion dropdown
                        let typingContext = extractContext(document, position);
                        let llmSuggestion = await getLLMSuggestion(typingContext);
                        const items = getCompletionItemsWithLLMSuggestion(llmSuggestion);
                        resolve(items);
                    }
                    else {
                        resolve([]); // Return empty array if there's insufficient context
                    }
                }, 2000); // Delay for 2000ms (2 seconds)
            });
        },
    });
    return tooltipProactiveProvider;
}
/* ------------------ */
function onConfigurationChanged(event) {
    updateSettings();
    if (event.affectsConfiguration('llmCodeCompletion.triggerMode')) {
        console.log(`Trigger mode changed to ${triggerMode}`);
        if (triggerMode === 'proactive') {
            vscode.workspace.onDidChangeTextDocument(onTextChanged);
            registerCompletionProvider();
        }
        else {
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
function updateSettings() {
    const config = vscode.workspace.getConfiguration(settingsName);
    triggerMode = config.get('triggerMode', triggerMode);
    displayMode = config.get('displayMode', displayMode);
    suggestionGranularity = config.get('suggestionGranularity', suggestionGranularity);
    includeDocumentation = config.get('includeDocumentation', includeDocumentation);
    inlineMaxLength = config.get('inlineMaxLength', inlineMaxLength);
}
/* --------- */
function deactivate() {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
}
//# sourceMappingURL=extension.js.map