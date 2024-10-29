"use strict";
// src/ChatbotViewProvider.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatbotViewProvider = void 0;
class ChatbotViewProvider {
    context;
    static viewType = 'llmCodeCompletion.chatbotView';
    constructor(context) {
        this.context = context;
    }
    resolveWebviewView(webviewView, _context, _token) {
        webviewView.webview.options = {
            enableScripts: true
        };
        webviewView.webview.html = this.getHtmlForWebview();
    }
    getHtmlForWebview() {
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
exports.ChatbotViewProvider = ChatbotViewProvider;
//# sourceMappingURL=ChatbotViewProvider.js.map