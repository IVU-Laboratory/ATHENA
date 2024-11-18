const vscodeApi = acquireVsCodeApi();

function sendMessage() {
  const input = document.getElementById('user-input');
  vscodeApi.postMessage({ command: 'userMessage', text: input.value });
  input.value = '';  // clear the input text
}

window.addEventListener('message', event => {
  const message = event.data;
  const content = document.getElementById('chatbot-content');
  //const newMessage = document.createElement('p');
  //newMessage.textContent = message.text;

  const messageDiv = document.createElement('div');
  messageDiv.classList.add(message.type); // Set the class to 'user' or 'assistant'

  
  const header = document.createElement('span');
  header.classList.add(message.type); // Set the class to 'user' or 'assistant'
  header.textContent = message.type === 'user' ? 'User: ' : 'Assistant: ';

  
  const text = document.createElement('span'); // Use span for inline text
  text.textContent = message.text;

  messageDiv.appendChild(header);
  messageDiv.appendChild(text);

  // Append the messageDiv to the content
  content.appendChild(messageDiv);

  content.scrollTop = content.scrollHeight; // Auto-scroll to bottom
});

document.getElementById("chatbotSendBtn").addEventListener("click", sendMessage)
