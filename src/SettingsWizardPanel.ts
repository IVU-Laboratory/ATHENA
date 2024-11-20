import * as vscode from 'vscode';

export class SettingsWizardPanel {
  public static currentPanel: SettingsWizardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;

  public static createOrShow(extensionUri: vscode.Uri) {
    if (SettingsWizardPanel.currentPanel) {
      SettingsWizardPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        'settingsWizard',
        'Completion settings',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        }
      );
  
      const currentPanel = new SettingsWizardPanel(panel, extensionUri);
      SettingsWizardPanel.currentPanel = currentPanel;
  
      // Fetch the current configuration and pass it to the Webview
      const config = vscode.workspace.getConfiguration('llmCodeCompletion');
      panel.webview.postMessage({
        type: 'initialize',
        displayMode: config.get('displayMode'),
        triggerMode: config.get('triggerMode'),
        suggestionGranularity: config.get('suggestionGranularity'),
        includeDocumentation: config.get('includeDocumentation'),
      });
    }
  }
  

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtmlForWebview();
    this._panel.webview.onDidReceiveMessage(this._handleMessage.bind(this));

    this._panel.onDidDispose(() => {
      SettingsWizardPanel.currentPanel = undefined;
    });
  }

  private _getHtmlForWebview(): string {
    const nonce = getNonce();
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Completion Settings</title>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
            window.addEventListener('message', (event) => {
                const message = event.data;

                if (message.type === 'initialize') {
                    document.getElementById('displayMode').value = message.displayMode;
                    document.getElementById('triggerMode').value = message.triggerMode;
                    document.getElementById('suggestionGranularity').value = message.suggestionGranularity;
                    document.getElementById('includeDocumentation').checked = message.includeDocumentation;
                }
            });

          function updateSliderValue(value) {
          document.getElementById('sliderValue').textContent = value;
          }

          function saveSettings() {
      const settings = {
        displayMode: document.getElementById('displayMode').value,
        triggerMode: document.getElementById('triggerMode').value,
        suggestionGranularity: document.getElementById('suggestionGranularity').value,
        includeDocumentation: document.getElementById('includeDocumentation').checked,
        shortcuts: {
          toggleSuggestion: document.getElementById('shortcutToggle').value,
          triggerSuggestion: document.getElementById('shortcutTrigger').value,
          openSettings: document.getElementById('shortcutSettings').value,
          openChatbot: document.getElementById('shortcutChatbot').value
        }
      };
      console.log('Settings saved:', settings);
      alert('Settings have been saved!');
    }

        

        </script>
        <style>

body {
  font-family: Arial, sans-serif;
  margin: 0;
  font-size: 13px;
  padding: 10px;
  background-color: #F8F8FF;
  color: #333;
  display: flex;
  flex-direction: column;
  align-items: center;
}

h1 {
  color: #fff; /* Bright header color */
  margin-bottom: 20px;
  font-size: 2em;
  text-align: center;
}

form {
  width: 100%;
  max-width: 600px;
}

.settings-group {
  background: #fff;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 8px;
  
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.settings-group h2 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #fff;
  background-color: #4444aa; /* Stylish header background */
  padding: 10px 15px;
  border-radius: 5px;
  font-size: 1.2em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
}

select, input[type="checkbox"], input[type="text"] {
   width: 100%;
  padding: 10px;
  margin-bottom: 20px;
  border: 1px solid #555; /* Subtle border for inputs */
  border-radius: 4px;
  font-size: 13px;
  color: dark-gray; /* Light text inside inputs */
  box-sizing: border-box;
}

input[type="text"]:focus, 
select:focus {
  outline: none;
  border-color: #8888ff; /* Highlight border on focus */
}
  
.slider-container {
  margin-bottom: 20px;
}

.slider-container input[type="range"] {
  width: 100%;
}

.slider-value {
  text-align: center;
  font-size: 1.2em;
  margin-top: 5px;
  color: #444;
}

button {
   background-color: #4CAF50;
  color: white;
  padding: 12px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  width: 100%;
  transition: background-color 0.3s ease-in-out;
}

button:hover {
  background-color: #45a049;
}
</style>
              </head>
      <body>
  <form>
    <!-- General Settings Section -->
    <div class="settings-group">
      <h2>General Settings</h2>
      <label for="displayMode">Completion mode:</label>
      <select id="displayMode">
        <option value="tooltip">Tooltip</option>
        <option value="inline">Inline</option>
        <option value="sideWindow">Side Window</option>
        <option value="chatbot">Chatbot</option>
        <option value="hybrid">Hybrid</option>
      </select>

      <label for="triggerMode">Completion trigger:</label>
      <select id="triggerMode">
        <option value="proactive">Proactive</option>
        <option value="onDemand">Manual</option>
      </select>

      <div class="slider-container">
        <label for="suggestionGranularity">Suggestion length (1-5):</label>
        <input type="range" id="suggestionGranularity" min="1" max="5" value="5" oninput="updateSliderValue(this.value)" />
        <div class="slider-value" id="sliderValue">5</div>
      </div>

      <label for="includeDocumentation">Provide source of completion:</label>
      <input type="checkbox" id="includeDocumentation" />
    </div>

    <!-- Keyboard Shortcuts Section -->
    <div class="settings-group">
      <h2>Keyboard Shortcuts</h2>
      <label for="shortcutToggle">Toggle Suggestion Activation:</label>
      <input type="text" id="shortcutToggle" value="Ctrl+Alt+S" />

      <label for="shortcutTrigger">Trigger Suggestion:</label>
      <input type="text" id="shortcutTrigger" value="Ctrl+Alt+R" />

      <label for="shortcutSettings">Open Settings:</label>
      <input type="text" id="shortcutSettings" value="Ctrl+Alt+T" />

      <label for="shortcutChatbot">Open Chatbot:</label>
      <input type="text" id="shortcutChatbot" value="Ctrl+Alt+P" />
    </div>

    <button type="button" onclick="saveSettings()">Save Settings</button>
  </form>
      </body>
      </html>`;
  }
  

  private async _handleMessage(message: any) {
    if (message.type === 'save') {
      const config = vscode.workspace.getConfiguration('llmCodeCompletion');
  
      // Update each configuration setting
      await config.update('displayMode', message.displayMode, vscode.ConfigurationTarget.Global);
      await config.update('triggerMode', message.triggerMode, vscode.ConfigurationTarget.Global);
      await config.update('suggestionGranularity', message.suggestionGranularity, vscode.ConfigurationTarget.Global);
      await config.update('includeDocumentation', message.includeDocumentation, vscode.ConfigurationTarget.Global);
  
      vscode.window.showInformationMessage('Settings saved successfully!');
    }
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
