// src/ChatbotViewProvider.ts

import * as vscode from 'vscode';

export class ChatbotViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'llmCodeCompletion.chatbotView';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this.getHtmlForWebview();
  }

  private getHtmlForWebview(): string {
    return `<html>
      <body>
        <h1>Chatbot Interface</h1>
        <div id="chatbot-content"></div>
        <input type="text" id="user-input" placeholder="Type your message..." />
        <button onclick="sendMessage()">Send</button>
        <script>
          const vscodeApi = acquireVsCodeApi();
          function sendMessage() {
            const input = document.getElementById('user-input');
            vscodeApi.postMessage({ type: 'message', text: input.value });
            input.value = '';
          }
          window.addEventListener('message', event => {
            const message = event.data;
            const content = document.getElementById('chatbot-content');
            content.innerHTML += '<p>' + message.text + '</p>';
          });
        </script>
      </body>
    </html>`;
  }
}
