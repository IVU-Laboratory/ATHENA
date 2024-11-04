"use strict";
// ChatbotViewProvider.ts
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
exports.ChatbotPanel = void 0;
const vscode = __importStar(require("vscode"));
const getUri_1 = require("./utilities/getUri");
const getNonce_1 = require("./utilities/getNonce");
class ChatbotPanel {
    static currentPanel;
    _panel;
    _extensionUri;
    constructor(panel, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        // Set the webview's HTML content
        this._panel.webview.html = this.getHtmlForWebview(this._panel.webview, this._extensionUri);
        // Clean up when the panel is closed
        this._panel.onDidDispose(() => {
            ChatbotPanel.currentPanel = undefined;
        });
    }
    static createOrShow(extensionUri) {
        // If the panel already exists, show it
        if (ChatbotPanel.currentPanel) {
            ChatbotPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel('chatbot', 'Chatbot', vscode.ViewColumn.Beside, // Opens on the right
        {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        });
        ChatbotPanel.currentPanel = new ChatbotPanel(panel, extensionUri);
    }
    static postMessage(message) {
        if (ChatbotPanel.currentPanel) {
            ChatbotPanel.currentPanel._panel.webview.postMessage({ text: message });
        }
    }
    // Function to generate HTML content for the webview
    getHtmlForWebview(webview, extensionUri) {
        // Get the URIs 
        const styleUri = (0, getUri_1.getUri)(webview, extensionUri, ['media', 'vscode.css']);
        const jsCodeURI = (0, getUri_1.getUri)(webview, extensionUri, ['media', 'index.js']);
        const nonce = (0, getNonce_1.getNonce)();
        return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<title>Chatbot Interface</title>
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; ">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">

			<link rel="stylesheet" href="${styleUri}">
			<script defer nonce="${nonce}" src="${jsCodeURI}"></script>
		</head>
		<body>
			<h3>Chatbot</h3>
			<div id="chatbot-content" class="chatbot-container"></div>
			<span>
				<input type="text" id="user-input" placeholder="Type a message..."/>
				<button id="chatbotSendBtn">Send</button>
			</span>
		</body>
		</html>`;
    }
}
exports.ChatbotPanel = ChatbotPanel;
//# sourceMappingURL=ChatbotViewProvider.js.map