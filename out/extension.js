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
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ChatbotPanel_1 = require(".\\ChatbotPanel"); // Import the ChatbotPanel
let typingTimeout;
let chatbotProvider;
const extension_id = 'uniba.llm-code-completion';
const settingsName = "llmCodeCompletion";
function activate(context) {
    const config = vscode.workspace.getConfiguration(settingsName);
    const triggerMode = config.get('triggerMode', 'proactive');
    if (triggerMode === 'proactive') {
        vscode.workspace.onDidChangeTextDocument(onTextChanged);
    }
    /* Register commands */
    context.subscriptions.push(vscode.commands.registerCommand('llmCodeCompletion.triggerSuggestion', triggerSuggestionCommand));
    context.subscriptions.push(vscode.commands.registerCommand('llmCodeCompletion.showConfigParameters', () => {
        let entire_config = vscode.workspace.getConfiguration();
        console.log("Entire Configuration object:", entire_config);
        let config = vscode.workspace.getConfiguration("llmCodeCompletion");
        console.log("Extension Configuration object (llmCodeCompletion):", config);
    }));
    // Register the command to open the chatbot panel
    context.subscriptions.push(vscode.commands.registerCommand('llmCodeCompletion.showChatbot', () => {
        ChatbotPanel_1.ChatbotPanel.createOrShow(context.extensionUri);
    }));
    /* -----------  */
    vscode.workspace.onDidChangeConfiguration(onConfigurationChanged);
}
function onTextChanged(event) {
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
async function triggerSuggestion(document, position) {
    if (!hasSufficientContext(document)) {
        return;
    }
    const config = vscode.workspace.getConfiguration(settingsName);
    const displayMode = config.get('displayMode', 'chatbot');
    const suggestionGranularity = config.get('suggestionGranularity', 5);
    const includeDocumentation = config.get('includeDocumentation', false);
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
function hasSufficientContext(document) {
    const MIN_CONTEXT_LENGTH = 10;
    return document.getText().trim().length > MIN_CONTEXT_LENGTH;
}
function extractContext(document, position) {
    const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    return text;
}
async function getLLMSuggestion(context, granularity) {
    // TODO Placeholder for LLM API call
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(`// LLM suggestion based on granularity level ${granularity}`);
            vscode.window.showInformationMessage;
        }, 1000);
    });
}
function enrichSuggestionWithDocumentation(suggestion) {
    return suggestion + `\n\n// Documentation references included.`;
}
function onConfigurationChanged(event) {
    if (event.affectsConfiguration('llmCodeCompletion.triggerMode')) {
        const config = vscode.workspace.getConfiguration(settingsName);
        const triggerMode = config.get('triggerMode', 'proactive');
        if (triggerMode === 'proactive') {
            vscode.workspace.onDidChangeTextDocument(onTextChanged);
        }
        else {
            if (typingTimeout) {
                clearTimeout(typingTimeout);
                typingTimeout = undefined;
            }
        }
    }
}
/* Suggestion showing functions */
// Inline suggestion
function showInlineSuggestion(editor, suggestion, position) {
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
function showSuggestionInSideWindow(suggestion) {
    const panel = vscode.window.createWebviewPanel('codeSuggestion', 'Code Suggestion', vscode.ViewColumn.Beside, {});
    panel.webview.html = `<html><body><pre>${suggestion}</pre></body></html>`;
}
// Chatbot suggestion
function showSuggestionInChatbot(suggestion) {
    vscode.window.showInformationMessage(suggestion);
    ChatbotPanel_1.ChatbotPanel.createOrShow(vscode.extensions.getExtension(extension_id).extensionUri);
    ChatbotPanel_1.ChatbotPanel.postMessage(suggestion);
}
/* --------- */
function deactivate() {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
}
//# sourceMappingURL=extension.js.map