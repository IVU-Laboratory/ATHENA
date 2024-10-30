const vscodeApi = acquireVsCodeApi();

function sendMessage() {
  const input = document.getElementById('user-input');
  vscodeApi.postMessage({ command: 'userMessage', text: input.value });
  input.value = '';  // clear the input text
}

window.addEventListener('message', event => {
  const message = event.data;
  const content = document.getElementById('chatbot-content');
  const newMessage = document.createElement('p');
  newMessage.textContent = message.text;
  content.appendChild(newMessage);
  content.scrollTop = content.scrollHeight; // Auto-scroll to bottom
});

document.getElementById("chatbotSendBtn").addEventListener("click", sendMessage)
