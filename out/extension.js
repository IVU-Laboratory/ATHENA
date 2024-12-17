"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.showSuggestionInChatbot = showSuggestionInChatbot;
const vscode = __importStar(require("vscode"));
const ChatbotPanel_1 = require(".\\ChatbotPanel"); // Import the ChatbotPanel
const SettingsWizardPanel_1 = require("./SettingsWizardPanel");
const settings_1 = require("./utilities/settings");
const CustomActionProvider_1 = require("./CustomActionProvider");
const GPT_1 = require("./GPT");
const TooltipProviderManager_1 = require("./TooltipProviderManager");
const InlineProviderManager_1 = require("./InlineProviderManager");
const context_1 = require("./utilities/context");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
let typingTimeout;
let chatbotProvider;
let proactiveCompletionListener; // The event listener for EVERY proactive suggestion method
let InlineCompletionManager; // The completion provider for the inline suggestions
let TooltipCompletionManager; // The completion provider for the tooltip suggestions 
const extension_id = 'uniba.llm-code-completion';
const settingsName = "llmCodeCompletion";
let toggle_suggestions = true;
let currentDecorationType = null;
let currentSuggestion = null;
let currentPosition = null;
// Default values for settings 
var triggerMode;
var displayMode;
var displayModeHybridShort;
var displayModeHybridLong;
var suggestionGranularity; // 1-10, indicates the granularity of the suggestion
var includeDocumentation; // Can be true or false to include or not the documentation in the suggestion
var inlineMaxLength = 50; // only works when displayMode="hybrid". Defines the maximum length of suggestions to be shown inline
var commentsGranularity;
var completionText;
var explanationText;
var toggleCompletionButton;
var shortcuts = {};
var ExtensionContext;
var Sidepanel;
function activate(context) {
    console.log("Starting LLM Code completion extension");
    ExtensionContext = context;
    const hasRunWizard = context.globalState.get('hasRunWizard', false);
    if (!hasRunWizard) {
        // Run the configuration wizard
        runConfigurationWizard();
    }
    else {
        loadSettings(); // Load settings into global variables
    }
    let envPath = path.join(context.extensionPath, '.env');
    let env_loaded = dotenv.config({ path: envPath }); // Load .env file
    if (env_loaded.error) {
        console.log(`"Error loading the environment variables in .env file (${envPath})! OpenAI key must be set there!`);
    }
    /*
       // Check if it's the first run
       const firstRunKey = 'llmCodeCompletion.firstRun';
       const globalState = context.globalState;
       const isFirstRun = !globalState.get(firstRunKey, false);
     
       if (isFirstRun) {
        console.log("First time using the extension. Opening Settings Wizard.");
        const conf = vscode.workspace.getConfiguration('llmCodeCompletion');
        const defaultShortcuts = {
          toggleSuggestion: 'Ctrl+Alt+S',
          triggerSuggestion: 'Ctrl+Alt+R',
          openSettings: 'Ctrl+Alt+T',
          openChatbot: 'Ctrl+Alt+P',
        };
    
        Object.keys(defaultShortcuts).forEach((key) => {
          const currentValue = conf.get(`shortcuts.${key}`);
          console.log(`Current value for ${key}: ${currentValue}`);
          // Only set the default shortcut if it hasn't been set already
          if (!currentValue) {
            conf.update(`shortcuts.${key}`, defaultShortcuts[key as keyof typeof defaultShortcuts], vscode.ConfigurationTarget.Global);
            console.log(`Setting default shortcut for ${key}: ${defaultShortcuts[key as keyof typeof defaultShortcuts]}`);
          } else {
            console.log(`Shortcut for ${key} already exists: ${currentValue}`);
          }
        });
    
    
        globalState.update(firstRunKey, true);
        SettingsWizardPanel.createOrShow(context.extensionUri);
      
          // Mark the first run as complete
        globalState.update(firstRunKey, true);
       }
      */
    /*
     const openSettingsCommand = vscode.commands.registerCommand('llmCodeCompletion.openSettingsWizard', () => {
       SettingsWizardPanel.createOrShow(context.extensionUri); // Open the settings wizard
     });
     context.subscriptions.push(openSettingsCommand);
     const settings = loadSettings();
     //registerDynamicShortcuts(context, settings.shortcuts);*/
    // Initialize the session with GPT-4o
    let openAIapikey = getOpenAIAPIkey();
    GPT_1.GPTSessionManager.initialize(openAIapikey);
    TooltipCompletionManager = new TooltipProviderManager_1.TooltipProviderManager();
    InlineCompletionManager = new InlineProviderManager_1.InlineProviderManager();
    if (triggerMode === settings_1.TriggerMode.Proactive) {
        enableProactiveBehavior();
    }
    completionText = '';
    explanationText = '';
    /* Register commands */
    context.subscriptions.push(vscode.commands.registerCommand('llmCodeCompletion.triggerSuggestion', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const position = editor.selection.active;
            await triggerSuggestion(document, position);
        }
    }));
    // Register the command to open the chatbot panel
    context.subscriptions.push(vscode.commands.registerCommand('llmCodeCompletion.showChatbot', () => {
        const editor = vscode.window.activeTextEditor;
        var documentText = "";
        if (editor) {
            documentText = editor.document.getText();
        }
        ChatbotPanel_1.ChatbotPanel.createOrShow(context.extensionUri, documentText);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('llmCodeCompletion.toggleAutomaticSuggestions', () => {
        if (triggerMode == settings_1.TriggerMode.Proactive) {
            disableProactiveBehavior();
            vscode.window.showInformationMessage('Automatic suggestions disabled.');
        }
        else {
            enableProactiveBehavior();
            vscode.window.showInformationMessage('Automatic suggestions enabled.');
        }
    }));
    const codeActionProvider = vscode.languages.registerCodeActionsProvider({ scheme: '*' }, // Adjust for your language
    new CustomActionProvider_1.CustomActionProvider(), { providedCodeActionKinds: CustomActionProvider_1.CustomActionProvider.providedCodeActionKinds });
    context.subscriptions.push(vscode.commands.registerCommand('llmCodeCompletion.openSettingsWizard', runConfigurationWizard));
    context.subscriptions.push(vscode.commands.registerCommand('extension.explainCode', (selectedText) => {
        GPT_1.GPTSessionManager.getLLMExplanation(selectedText, "what").then(explanation => {
            showSuggestionInSideWindow("", explanation);
        });
    }));
    // Register the "Why this code?" command
    context.subscriptions.push(vscode.commands.registerCommand('extension.whyThisCode', (selectedText) => {
        GPT_1.GPTSessionManager.getLLMExplanation(selectedText, "why").then(explanation => {
            showSuggestionInSideWindow("", explanation);
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.openInChatbot', (selectedText) => {
        GPT_1.GPTSessionManager.getLLMExplanation(selectedText, "what").then(explanation => {
            const editor = vscode.window.activeTextEditor;
            let code = "";
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found. Please open a file to get context.');
            }
            else {
                const document = editor.document;
                code = document.getText();
            }
            showSuggestionInChatbot(explanation, code);
        });
    }));
    vscode.workspace.onDidChangeConfiguration(onConfigurationChanged); // Update settings automatically on change.
    //addButtonsToEditor(context); NON FUNZIONA
}
/* Callback used by the editor for proactive code completion */
function onTextChanged(event) {
    const idleTime = 2000; // show suggestion after 2 seconds
    const document = event.document;
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    typingTimeout = setTimeout(() => {
        if ((0, context_1.hasSufficientContext)(document)) {
            const position = event.contentChanges[0]?.range.end || new vscode.Position(0, 0);
            triggerSuggestion(document, position);
        }
    }, idleTime);
}
function registerDynamicShortcuts(context, shortcuts) {
    //TODO
    const { toggleSuggestion, triggerSuggestion, openSettings, openChatbot } = shortcuts;
    // Register each command with its respective shortcut
    const keybindings = [
        { command: 'llmCodeCompletion.toggleSuggestion', keybinding: toggleSuggestion },
        { command: 'llmCodeCompletion.triggerSuggestion', keybinding: triggerSuggestion },
        { command: 'llmCodeCompletion.openSettingsWizard', keybinding: openSettings },
        { command: 'llmCodeCompletion.showChatbot', keybinding: openChatbot },
    ];
    keybindings.forEach(({ command, keybinding }) => {
        context.subscriptions.push(vscode.commands.registerCommand(command, () => {
            vscode.commands.executeCommand(command);
        }));
        vscode.commands.executeCommand('setContext', command, keybinding);
        console.log(`Registered shortcut: ${keybinding} for ${command}`);
    });
}
async function triggerSuggestion(document, position) {
    // Generate suggestions only if there is sufficient context 
    if (!(0, context_1.hasSufficientContext)(document)) {
        return;
    }
    //console.log("triggering suggestion with Display mode: " + displayMode);
    //console.log("triggering suggestion with Trigger mode: " + triggerMode);
    const contextText = (0, context_1.extractContext)(document, position);
    const suggestion = await GPT_1.GPTSessionManager.getLLMSuggestion(contextText, includeDocumentation, commentsGranularity);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        switch (displayMode) {
            case 'tooltip': // this should only be called when the user asks for a suggestion (not proactively - for that, there is the completionProvider)
                if (triggerMode != settings_1.TriggerMode.Proactive) {
                    console.log("Showing tooltip suggestion on demand");
                    TooltipCompletionManager.provideOnDemandSuggestion(editor, suggestion, position);
                }
                break;
            case 'inline':
                if (triggerMode != settings_1.TriggerMode.Proactive) {
                    console.log("Showing inline suggestion on demand");
                    InlineCompletionManager.provideOnDemandSuggestion(editor, suggestion, position);
                }
                break;
            case 'sideWindow':
                console.log("Showing sidewindow suggestion");
                showSuggestionInSideWindow(suggestion, "");
                break;
            case 'chatbot':
                //showSuggestionInChatbot(suggestion,contextText);
                break;
            case 'hybrid':
                if (suggestion.length <= inlineMaxLength) {
                    // Short suggestion
                    if (displayModeHybridShort == settings_1.DisplayMode.Inline) {
                        InlineCompletionManager.provideOnDemandSuggestion(editor, suggestion, position);
                    }
                    else if (displayModeHybridShort == settings_1.DisplayMode.Tooltip) {
                        TooltipCompletionManager.provideOnDemandSuggestion(editor, suggestion, position);
                    }
                }
                else {
                    // Long suggestion
                    if (displayModeHybridLong == settings_1.DisplayMode.SideWindow) {
                        showSuggestionInSideWindow(suggestion, "");
                    }
                    else if (displayModeHybridLong == settings_1.DisplayMode.Chatbot) {
                        showSuggestionInChatbot(suggestion, contextText);
                    }
                }
                break;
        }
    }
    else {
        console.log("No editor.");
    }
}
function addButtonsToEditor(context) {
    const visibleEditors = vscode.window.visibleTextEditors;
    var editor;
    // Create decoration for the toggle button
    toggleCompletionButton = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: ' [Suggestions: On/Off] ', // Button label
            backgroundColor: new vscode.ThemeColor('button.background'),
            color: new vscode.ThemeColor('button.foreground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('button.border'),
            margin: '0 0 0 10px',
        },
    });
    // Get the range for the first line
    for (editor of visibleEditors) {
        const range = editor.document.lineAt(0).range;
        // Apply the decorations
        editor.setDecorations(toggleCompletionButton, [range]);
    }
    // editor.setDecorations(additionalFunctionButton, [range]);
}
function toggleAutoCompletion() {
    toggle_suggestions = !toggle_suggestions;
    // Update button text
    const newText = toggle_suggestions ? ' [Auto-Complete: On] ' : ' [Auto-Complete: Off] ';
    toggleCompletionButton.dispose();
}
function handleButtonClicks() {
    vscode.window.onDidChangeTextEditorSelection((event) => {
        const editor = event.textEditor;
        const cursorPosition = editor.selection.active;
        const extension_uri = vscode.extensions.getExtension(extension_id).extensionUri;
        // Get the first line's range
        const firstLineRange = editor.document.lineAt(0).range;
        // Check if the cursor is within the range of the toggle button
        if (cursorPosition.line === 0) {
            const cursorChar = cursorPosition.character;
            if (cursorChar >= firstLineRange.start.character && cursorChar <= firstLineRange.end.character + 20) {
                vscode.commands.executeCommand('llmCodeCompletion.toggleInlineSuggestions');
            }
            else if (cursorChar > firstLineRange.end.character + 20 && cursorChar <= firstLineRange.end.character + 40) {
                SettingsWizardPanel_1.SettingsWizardPanel.createOrShow(extension_uri);
            }
        }
    });
}
// Lateral window suggestion 
function showSuggestionInSideWindow(suggestion, explanation) {
    ////explanationText += (explanationText ? '\n' : '') + explanation;
    //completionText += (completionText ? '\n' : '') + suggestion;
    /*
    if(suggestion!= ""){
      completionText = `
      <div class="chat-block suggestion-block">
        <pre>${suggestion}</pre>
      </div>
    `;
    }
    */
    if (suggestion != "") {
        completionText = suggestion;
    }
    if (explanation != "") {
        explanationText += `
    <div class="chat-block explanation-block">
      <div>${explanation}</div>
    </div>
  `;
    }
    if (Sidepanel == null) {
        Sidepanel = vscode.window.createWebviewPanel('codeSuggestion', 'Code Suggestion', vscode.ViewColumn.Beside, {
            enableScripts: true,
        });
    }
    Sidepanel.webview.onDidReceiveMessage((message) => {
        switch (message.command) {
            case 'clearSuggestion':
                clearSuggestionPanel();
                break;
            case 'clearExplanation':
                clearExplanationPanel();
                break;
            case 'useSuggestion':
                focusEditorAndInsertSuggestion(message.suggestion);
                break;
            case 'explainSuggestion':
                GPT_1.GPTSessionManager.getLLMExplanation(message.suggestion, "why").then(exp => {
                    showSuggestionInSideWindow(message.suggestion, exp);
                });
                break;
            default:
                console.warn(`Unknown command received: ${message.command}`);
        }
    });
    // Sidepanel.webview.html = `<html><body><pre style="text-wrap: wrap;">${suggestion}</pre></body></html>`;
    Sidepanel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Code Suggestions</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #1e1e1e;
          color: #f0f0f0;
        }

        .accordion {
          background-color: #2c2c2c;
          border: 1px solid #444;
          border-radius: 5px;
          margin: 0;
        }

        .accordion-header {
          padding: 10px;
          cursor: pointer;
          font-weight: bold;
          color: #ffffff;
          background-color: #3a3a3a;
          border-bottom: 1px solid #555;
        }
        .accordion-header:hover {
          background-color: #444;
        }

        .accordion-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease-out;
          padding: 0 10px;
          background-color: #2c2c2c;
        }
        .accordion-content.expanded {
          max-height: 300px;
          padding: 10px;
        }

        .code-snippet {
          font-family: "Courier New", Courier, monospace;
          font-size: 13px;
          line-height: 1.6;
          background-color: #1e1e1e;
          border: 1px solid #444;
          padding: 10px;
          border-radius: 5px;
          overflow-x: auto;
          white-space: pre-wrap;
          color: #d4d4d4;
        }

        button.use-btn {
          margin-top: 10px;
          padding: 5px 10px;
          background-color: #4CAF50; /* Green button */
          color: #ffffff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button.use-btn:hover {
          background-color: #45a049;
        }

        button.explain-btn {
          margin-top: 10px;
          padding: 5px 10px;
          background-color: #007acc; /* Blue button */
          color: #ffffff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button.explain-btn:hover {
          background-color: #005f99;
        }
      </style>
    </head>
    <body>
      <!-- Code Suggestion Panel -->
      <div class="accordion">
        <div class="accordion-header">Code Suggestion</div>
        <div class="accordion-content expanded" id="suggestion-panel">
          <div class="code-snippet" id="suggestion-content">${completionText}</div>
          <button class="use-btn" onclick="useSuggestion()">Use Suggestion</button>
          <button class="explain-btn" onclick="explainSuggestion()">Explain</button>
        </div>
      </div>

      <!-- Explanation Panel -->
      <div class="accordion">
        <div class="accordion-header">Code Explanation</div>
        <div class="accordion-content expanded" id="explanation-panel">
          ${explanationText}
          <button class="use-btn" onclick="clearExplanation()">Clear</button>
        </div>
      </div>

      <script>
        // Use the provided suggestion
        function useSuggestion() {
          const suggestion = document.getElementById('suggestion-content').textContent;
          const vscode = acquireVsCodeApi();
          vscode.postMessage({ command: 'useSuggestion', suggestion });
        }

        // Explain the provided suggestion
        function explainSuggestion() {
          const suggestion = document.getElementById('suggestion-content').textContent;
          const vscode = acquireVsCodeApi();
          vscode.postMessage({ command: 'explainSuggestion', suggestion });
        }

        // Clear the explanation content
        function clearExplanation() {
          const vscode = acquireVsCodeApi();
          vscode.postMessage({ command: 'clearExplanation' });
        }
      </script>
    </body>
    </html>
  `;
}
// Helper function to focus the editor and insert the suggestion
function focusEditorAndInsertSuggestion(suggestion) {
    vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup').then(() => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        const selection = editor.selection;
        editor.edit((editBuilder) => {
            editBuilder.replace(selection, suggestion);
        });
    });
}
//functions to clear the side panel
function clearSidePanel() {
    completionText = '';
    explanationText = '';
    showSuggestionInSideWindow("", "");
}
function clearSuggestionPanel() {
    completionText = '';
    showSuggestionInSideWindow("", "");
}
function clearExplanationPanel() {
    explanationText = '';
    showSuggestionInSideWindow("", "");
}
// Chatbot suggestion (potrebbe non servire)
function showSuggestionInChatbot(suggestion, contextText) {
    vscode.window.showInformationMessage(suggestion);
    ChatbotPanel_1.ChatbotPanel.createOrShow(vscode.extensions.getExtension(extension_id).extensionUri, contextText);
    ChatbotPanel_1.ChatbotPanel.postMessage(suggestion);
}
/* ----------- Configuration related functions ------------ */
function onConfigurationChanged(event) {
    if (event.affectsConfiguration('llmCodeCompletion')) {
        // console.log(`Configuration changed. \n- triggerMode changed? ${event.affectsConfiguration('llmCodeCompletion.triggerMode')} \n- displayMode changed? ${event.affectsConfiguration('llmCodeCompletion.displayMode')}`);
        loadSettings();
        if (triggerMode === settings_1.TriggerMode.Proactive) {
            enableProactiveBehavior();
        }
        else {
            disableProactiveBehavior();
        }
    }
    if (event.affectsConfiguration('llmCodeCompletion.openaiAPIKey')) {
        // set the openAI API key if it gets updated
        const new_api_key = getOpenAIAPIkey();
        if (new_api_key != "") {
            GPT_1.GPTSessionManager.initialize(new_api_key);
        }
    }
}
function getOpenAIAPIkey() {
    let key = "";
    // try to fetch the API key from the configurations 
    const config = vscode.workspace.getConfiguration('llmCodeCompletion');
    key = config.get("openaiAPIKey", "");
    if (key == "") {
        // try to fetch it from the .env file
        key = process.env.OPENAI_API_KEY ?? "";
    }
    return key;
}
async function enableProactiveBehavior() {
    proactiveCompletionListener = vscode.workspace.onDidChangeTextDocument(onTextChanged);
    if (displayMode === settings_1.DisplayMode.Tooltip || (displayMode === settings_1.DisplayMode.Hybrid && displayModeHybridShort === settings_1.DisplayMode.Tooltip)) {
        // Register the completion provider for proactive tooltip display
        ExtensionContext.subscriptions.push(TooltipCompletionManager.enableProactiveBehavior());
    }
    else if (displayMode === settings_1.DisplayMode.Inline || (displayMode === settings_1.DisplayMode.Hybrid && displayModeHybridShort === settings_1.DisplayMode.Inline)) {
        // Register the completion provider for proactive inline display
        ExtensionContext.subscriptions.push(InlineCompletionManager.enableProactiveBehavior());
    }
    // Ensure the triggerMode is updated
    if (triggerMode == settings_1.TriggerMode.OnDemand) {
        // Change the config to TriggerMode.Proactive
        const config = vscode.workspace.getConfiguration('llmCodeCompletion');
        await config.update('triggerMode', settings_1.TriggerMode.Proactive, vscode.ConfigurationTarget.Global);
    }
}
async function disableProactiveBehavior() {
    proactiveCompletionListener?.dispose();
    clearTimeout(typingTimeout); // Set the typing timeout to undefined to prevent proactive behavior
    TooltipCompletionManager.disableProactiveBehavior(); // unregister tooltip completion provider if exists
    InlineCompletionManager.disableProactiveBehavior(); // unregister inline completion provider if exists
    // Ensure the triggerMode is updated
    if (triggerMode == settings_1.TriggerMode.Proactive) {
        // Change the config to TriggerMode.OnDemand
        const config = vscode.workspace.getConfiguration('llmCodeCompletion');
        await config.update('triggerMode', settings_1.TriggerMode.OnDemand, vscode.ConfigurationTarget.Global);
    }
}
async function runConfigurationWizard() {
    const context = ExtensionContext;
    // Ask the user their programming level
    const programmingLevels = ['Beginner', 'Intermediate', 'Advanced'];
    let programmingLevel = await vscode.window.showQuickPick(programmingLevels, {
        placeHolder: 'LLM Code Completion extension configuration: Select your programming level...',
    });
    programmingLevel = programmingLevel?.toLowerCase();
    if (!programmingLevel) {
        // User canceled the wizard
        vscode.window.showInformationMessage('Setup canceled.');
        return;
    }
    // Update the default settings based on the chosen experience level
    setDefaultSettings(programmingLevel);
    // Show the editable settings
    /*vscode.window.showInformationMessage(
      `So you are ${programmingLevel == "beginner" ? "a" : "an"} ${programmingLevel} programmer. You can now customize your experience with the LLM code completion extension.`
    );*/
    vscode.commands.executeCommand('workbench.action.openSettings', 'llmCodeCompletion'); // Open the extension's settings panel
    // Mark the wizard as completed
    context.globalState.update('hasRunWizard', true);
}
async function setDefaultSettings(programmingLevel) {
    switch (programmingLevel) {
        case 'beginner':
            triggerMode = settings_1.TriggerMode.Proactive;
            displayMode = settings_1.DisplayMode.Inline;
            includeDocumentation = true;
            suggestionGranularity = 5;
            break;
        case 'intermediate':
            triggerMode = settings_1.TriggerMode.OnDemand;
            displayMode = settings_1.DisplayMode.Hybrid;
            displayModeHybridShort = settings_1.DisplayMode.Inline;
            displayModeHybridLong = settings_1.DisplayMode.SideWindow;
            suggestionGranularity = 5;
            includeDocumentation = true;
            break;
        case 'advanced':
            triggerMode = settings_1.TriggerMode.OnDemand;
            displayMode = settings_1.DisplayMode.Hybrid;
            displayModeHybridShort = settings_1.DisplayMode.Tooltip;
            displayModeHybridLong = settings_1.DisplayMode.SideWindow;
            suggestionGranularity = 5;
            includeDocumentation = false;
            break;
    }
    // Update settings with default values
    const config = vscode.workspace.getConfiguration('llmCodeCompletion');
    await config.update('triggerMode', triggerMode, vscode.ConfigurationTarget.Global);
    await config.update('displayMode', displayMode, vscode.ConfigurationTarget.Global);
    await config.update('hybridModeShortSuggestions', displayModeHybridShort, vscode.ConfigurationTarget.Global);
    await config.update('hybridModeLongSuggestions', displayModeHybridLong, vscode.ConfigurationTarget.Global);
    await config.update('suggestionGranularity', suggestionGranularity, vscode.ConfigurationTarget.Global);
    await config.update('includeDocumentation', includeDocumentation, vscode.ConfigurationTarget.Global);
}
function loadSettings() {
    // Automatically update global parameters from settings
    const config = vscode.workspace.getConfiguration('llmCodeCompletion');
    triggerMode = config.get('triggerMode', settings_1.TriggerMode.OnDemand);
    displayModeHybridShort = config.get('hybridModeShortSuggestions', settings_1.DisplayMode.Inline);
    displayModeHybridLong = config.get('hybridModeLongSuggestions', settings_1.DisplayMode.SideWindow);
    displayMode = config.get('displayMode', settings_1.DisplayMode.Inline);
    suggestionGranularity = config.get('suggestionGranularity', 5); // Default is 5
    includeDocumentation = config.get('includeDocumentation', false); // Default is false
    // inlineMaxLength = config.get<number>('inlineMaxLength', inlineMaxLength);
    shortcuts = {
        toggleSuggestion: config.get('shortcuts.toggleSuggestion', 'ctrl+alt+s'),
        triggerSuggestion: config.get('shortcuts.triggerSuggestion', 'ctrl+alt+r'),
        openSettings: config.get('shortcuts.openSettings', 'ctrl+alt+t'),
        openChatbot: config.get('shortcuts.openChatbot', 'ctrl+alt+p'),
    };
    console.log(`Settings loaded:\nDisplay mode = ${displayMode}\nTrigger mode = ${triggerMode}\nSuggestion granularity = ${suggestionGranularity}\n`);
    // Dynamically shows/hides the hybrid parameters
    vscode.commands.executeCommand('setContext', 'llmCodeCompletion.showHybridConfigs', displayMode === settings_1.DisplayMode.Hybrid); //TODO: does not work
    return { displayMode, triggerMode, suggestionGranularity, includeDocumentation, shortcuts };
}
//# sourceMappingURL=extension.js.map