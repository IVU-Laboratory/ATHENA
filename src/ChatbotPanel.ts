// ChatbotViewProvider.ts

import * as vscode from 'vscode';
import { getUri } from "./utilities/getUri";
import { getNonce } from "./utilities/getNonce";

export class ChatbotPanel {
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

  public static createOrShow(extensionUri: vscode.Uri) {
    // If the panel already exists, show it
    if (ChatbotPanel.currentPanel) {
      ChatbotPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
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
  }

  public static postMessage(message: string) {
    vscode.window.showInformationMessage(message)
    if (ChatbotPanel.currentPanel) {
      ChatbotPanel.currentPanel._panel.webview.postMessage({ text: message });
    }
  }

    // Method to handle the user's message from the webview
    private handleUserMessage(text: string) {
      // Process the user's message here, for example:
      const response = `You said: ${text}`;
      // Send a response back to the webview
      this._panel.webview.postMessage({ text: response });
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
