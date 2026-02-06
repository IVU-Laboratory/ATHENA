// ChatbotViewProvider.ts

import * as vscode from 'vscode';
import { getUri } from "./utilities/getUri";
import { getNonce } from "./utilities/getNonce";
import axios from 'axios';
import { GPTSessionManager } from './GPT';

export class ChatbotPanel {
  private contextText: string = '';
  public static currentPanel: ChatbotPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's HTML content
    this._panel.webview.html = this.getHtmlForWebview(this._panel.webview, this._extensionUri);

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => {
      ChatbotPanel.currentPanel = undefined;
    });

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'userMessage':
          this.handleUserMessage(message.text);
          break;
      }
    });
  }

  public static createOrShow(extensionUri: vscode.Uri, documentText: string) {
    // If the panel already exists, show it
    if (ChatbotPanel.currentPanel) {
      ChatbotPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
      this.updateContext(documentText);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'chatbot',
      'Chatbot',
      vscode.ViewColumn.Beside, // Opens on the right
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    ChatbotPanel.currentPanel = new ChatbotPanel(panel, extensionUri);
    this.updateContext(documentText);
  }

  private static updateContext(updatedText: string) {
    if (this.currentPanel) {
      this.currentPanel.contextText = updatedText;
    }
  }

  public static postMessage(message: string) {
    vscode.window.showInformationMessage(message)
    if (ChatbotPanel.currentPanel) {
      ChatbotPanel.currentPanel._panel.webview.postMessage({ text: message, type: 'assistant' });
    }
  }

    // Method to handle the user's message from the webview
    private async handleUserMessage(text: string) {
       
      const question = text;
      // Send a response back to the webview
      this._panel.webview.postMessage({ text: question, type: "user" });

      const response = await GPTSessionManager.chatbotRequest(question + "\nContext code for the response:\n"+this.contextText);
      this._panel.webview.postMessage({ text: response, type: "assistant" });

    }
	
  // Function to generate HTML content for the webview
  private getHtmlForWebview(webview: vscode.Webview,  extensionUri: vscode.Uri): string {
    // Get the URIs 
		const styleUri = getUri(webview, extensionUri, ['media', 'vscode.css']);
		const jsCodeURI = getUri(webview, extensionUri, ['media', 'index.js']);

		const nonce = getNonce();

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
			<div class="chatbot-wrapper">
				<div class="chatbot-header">
					<h2>AI Coding Assistant</h2>
					<p class="chatbot-subtitle">Ask anything about your code</p>
				</div>
				<div id="chatbot-content" class="chatbot-container"></div>
				<div class="chatbot-loading" id="loading-indicator" style="display: none;">
					<span class="spinner"></span>
					<span>AI is thinking...</span>
				</div>
				<div class="chatbot-input-wrapper">
					<input type="text" id="user-input" class="chatbot-input" placeholder="Type your question here..." autocomplete="off"/>
					<button id="chatbotSendBtn" class="chatbot-send-btn" title="Send message (Enter)">
						<span class="send-icon">➤</span>
					</button>
				</div>
			</div>
		</body>
		</html>`;
  }

}
