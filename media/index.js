const vscodeApi = acquireVsCodeApi();

function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  
  if (!text) return;
  
  const sendBtn = document.getElementById('chatbotSendBtn');
  const loadingIndicator = document.getElementById('loading-indicator');
  
  // Send the message
  vscodeApi.postMessage({ command: 'userMessage', text: text });
  
  // Clear the input and disable button
  input.value = '';
  sendBtn.disabled = true;
  loadingIndicator.style.display = 'flex';
  input.focus();
}

window.addEventListener('message', event => {
  const message = event.data;
  const content = document.getElementById('chatbot-content');
  const sendBtn = document.getElementById('chatbotSendBtn');
  const loadingIndicator = document.getElementById('loading-indicator');

  // Only process messages that have a type (user or assistant)
  if (!message.type) return;

  const messageDiv = document.createElement('div');
  messageDiv.classList.add(message.type);

  const header = document.createElement('span');
  header.textContent = message.type === 'user' ? 'You' : 'Assistant';

  const text = document.createElement('span');
  // Convert markdown-like code blocks to better formatting
  text.textContent = message.text;

  messageDiv.appendChild(header);
  messageDiv.appendChild(text);

  // Hide loading indicator and enable button when assistant responds
  if (message.type === 'assistant') {
    loadingIndicator.style.display = 'none';
    sendBtn.disabled = false;
  }

  content.appendChild(messageDiv);
  content.scrollTop = content.scrollHeight;
});

const sendBtn = document.getElementById('chatbotSendBtn');
const inputField = document.getElementById('user-input');

// Send message on button click
sendBtn.addEventListener('click', sendMessage);

// Send message on Enter key press
inputField.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
