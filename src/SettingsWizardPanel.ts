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
        displayMode: config.get('displayMode', 'inline'),
        triggerMode: config.get('triggerMode', 'proactive'),
        suggestionGranularity: config.get('suggestionGranularity', 8),
        includeDocumentation: config.get('includeDocumentation', false),
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
            const displayMode = document.getElementById('displayMode').value;
            const triggerMode = document.getElementById('triggerMode').value;
            const suggestionGranularity = document.getElementById('suggestionGranularity').value;
            const includeDocumentation = document.getElementById('includeDocumentation').checked;
  
            vscode.postMessage({
              type: 'save',
              displayMode,
              triggerMode,
              suggestionGranularity: Number(suggestionGranularity),
              includeDocumentation
            });
          }

        

        </script>
        <style>
body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f4f4f9;
    color: #333;
    width:400px;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
}


h1 {
    color: #444;
}
form {
    background: #fff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 400px;
}
label {
    display: block;
    margin-bottom: 8px;
    font-weight: bold;
}
select, input[type="checkbox"] {
    width: 100%;
    padding: 10px;
    margin-bottom: 20px;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
}
.slider-container {
    margin-bottom: 20px;
}
.slider-container label {
    margin-bottom: 5px;
}
.slider-container input[type="range"] {
    width: 100%;
}
.slider-value {
    text-align: center;
    text-weight: bold;
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
    font-size: 16px;
    width: 100%;
}
button:hover {
    background-color: #45a049;
}

        </style>
              </head>
      <body>
        <h1>Code Completion Settings</h1>
  <form>
    <label for="displayMode">Suggestion mode:</label>
    <select id="displayMode">
      <option value="tooltip">Tooltip</option>
      <option value="inline">Inline</option>
      <option value="sideWindow">Side window</option>
      <option value="hybrid">Hybrid</option>
    </select>

    <label for="triggerMode">Timing:</label>
    <select id="triggerMode">
      <option value="proactive">Proactive</option>
      <option value="onDemand">On demand</option>
    </select>

    <div class="slider-container">
      <label for="suggestionGranularity">Suggestion lenght (1-10):</label>
      <input type="range" id="suggestionGranularity" min="1" max="10" value="8" oninput="updateSliderValue(this.value)" />
      <div class="slider-value" id="sliderValue">8</div>
    </div>

    <div >Provide source code documentation:</div>
    <input type="checkbox" id="includeDocumentation" />

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
