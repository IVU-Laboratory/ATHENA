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
        document.getElementById('commentsGranularity').value = message.commentsGranularity;
        updateSliderValue(message.suggestionGranularity, 'sliderValue');
        updateSliderValue(message.commentsGranularity, 'commentsSliderValue');
      }
    });

    function updateSliderValue(value, targetId) {
      document.getElementById(targetId).textContent = value;
    }

    function saveSettings() {
      const settings = {
        displayMode: document.getElementById('displayMode').value,
        triggerMode: document.getElementById('triggerMode').value,
        suggestionGranularity: document.getElementById('suggestionGranularity').value,
        includeDocumentation: document.getElementById('includeDocumentation').checked,
        commentsGranularity: document.getElementById('commentsGranularity').value,
        shortcuts: {
          toggleSuggestion: document.getElementById('shortcutToggle').value,
          triggerSuggestion: document.getElementById('shortcutTrigger').value,
          openSettings: document.getElementById('shortcutSettings').value,
          openChatbot: document.getElementById('shortcutChatbot').value,
        },
      };

      vscode.postMessage({ type: 'save', ...settings });
    }
  </script>
  <style>
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      margin: 0;
      padding: 5px 20px;
      background-color: #1c1f26; /* Darker background */
      color: #e8e8e8; /* Light text for readability */
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    h1 {
      font-size: 1.8em;
      margin-bottom: 20px;
      color: #f4f4f4; /* Neutral white for headings */
      text-align: center;
    }

    form {
      width: 100%;
      max-width: 700px;
      background-color: #252a33; /* Contrast against the background */
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }

    .settings-group {
      margin-bottom: 20px;
      padding: 15px;
      background-color: #2e3440; /* Dark grey for panels */
      border-radius: 6px;
    }

    .settings-group h2 {
      margin-top: 0;
      margin-bottom: 15px;
      color: #f4f4f4; /* Neutral white */
      background-color: #3b4252; /* Distinct dark blue-grey */
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 1.2em;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: #e8e8e8;
    }

    select, input[type="checkbox"], input[type="text"] {
      width: 100%;
      padding: 10px;
      margin-bottom: 20px;
      border: 1px solid #888;
      border-radius: 4px;
      font-size: 13px;
      box-sizing: border-box;
      background-color: #434c5e;
      color: #e8e8e8;
    }

    input[type="range"] {
      width: 100%;
      margin-bottom: 10px;
    }

    .slider-value {
      text-align: right;
      font-size: 1em;
      margin-bottom: 10px;
      color: #88c0d0; /* Soft teal for emphasis */
    }

    button {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      color: white;
      background-color: #5e81ac; /* Muted blue for primary action */
      transition: background-color 0.3s;
    }

    button:hover {
      background-color: #4c70a4;
    }
  </style>
</head>
<body>
  <form>
    <!-- General Settings Section -->
    <div class="settings-group">
      <h2>General Settings</h2>
      <label for="displayMode">Completion Mode:</label>
      <select id="displayMode">
        <option value="tooltip">Tooltip</option>
        <option value="inline">Inline</option>
        <option value="sideWindow">Side Window</option>
        <option value="hybrid">Hybrid</option>
      </select>

      <label for="triggerMode">Completion Trigger:</label>
      <select id="triggerMode">
        <option value="proactive">Proactive</option>
        <option value="onDemand">Manual</option>
      </select>

      <div class="slider-container">
        <label for="suggestionGranularity">Suggestion Length (1-5):</label>
        <input type="range" id="suggestionGranularity" min="1" max="5" value="5" oninput="updateSliderValue(this.value, 'sliderValue')" />
        <div class="slider-value" id="sliderValue">5</div>
      </div>

      <div class="slider-container">
        <label for="commentsGranularity">Comments Granularity (0-3):</label>
        <input type="range" id="commentsGranularity" min="0" max="3" value="0" oninput="updateSliderValue(this.value, 'commentsSliderValue')" />
        <div class="slider-value" id="commentsSliderValue">0</div>
      </div>

      <label for="includeDocumentation">Provide Source of Completion:</label>
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
</html>
`;
  }
  

  private async _handleMessage(message: any) {
    if (message.type === 'save') {
      const config = vscode.workspace.getConfiguration('llmCodeCompletion');
  
      // Update general settings
      await config.update('displayMode', message.displayMode, vscode.ConfigurationTarget.Global);
      await config.update('triggerMode', message.triggerMode, vscode.ConfigurationTarget.Global);
      await config.update('suggestionGranularity', message.suggestionGranularity, vscode.ConfigurationTarget.Global);
      await config.update('includeDocumentation', message.includeDocumentation, vscode.ConfigurationTarget.Global);
  
      // Update shortcut settings
      // Update individual shortcut settings
      await config.update('shortcuts.toggleSuggestion', message.shortcuts.toggleSuggestion, vscode.ConfigurationTarget.Global);
      await config.update('shortcuts.triggerSuggestion', message.shortcuts.triggerSuggestion, vscode.ConfigurationTarget.Global);
      await config.update('shortcuts.openSettings', message.shortcuts.openSettings, vscode.ConfigurationTarget.Global);
      await config.update('shortcuts.openChatbot', message.shortcuts.openChatbot, vscode.ConfigurationTarget.Global);

  
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
