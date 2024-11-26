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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.showSuggestionInChatbot = showSuggestionInChatbot;
exports.updateSettings = updateSettings;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ChatbotPanel_1 = require(".\\ChatbotPanel"); // Import the ChatbotPanel
const SettingsWizardPanel_1 = require("./SettingsWizardPanel");
const settings_1 = require("./utilities/settings");
const axios_1 = __importDefault(require("axios"));
const InlineCompletionProvider_1 = require("./InlineCompletionProvider");
const apiKey = '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';
let typingTimeout;
let chatbotProvider;
let inlineCompletionDisposable;
const extension_id = 'uniba.llm-code-completion';
const settingsName = "llmCodeCompletion";
let toggle_suggestions = true;
let providerInstance;
let currentDecorationType = null;
let currentSuggestion = null;
let currentPosition = null;
// Default values for settings 
var triggerMode = settings_1.TriggerMode.OnDemand;
var displayMode = settings_1.DisplayMode.Tooltip;
var suggestionGranularity = 10; // 1-10, indicates the granularity of the suggestion
var includeDocumentation = true; // Can be true or false to include or not the documentation in the suggestion
var inlineMaxLength = 50; // only works when displayMode="hybrid". Defines the maximum length of suggestions to be shown inline 
// var triggerShortcut = "ctrl+alt+s"; //this is already defined in the package.json file 
var toggleCompletionButton;
var tooltipProactiveProvider; // The completion provider for the tooltip suggestions 
var shortcuts = {};
function activate(context) {
    console.log("Starting LLM Code completion extension");
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
                conf.update(`shortcuts.${key}`, defaultShortcuts[key], vscode.ConfigurationTarget.Global);
                console.log(`Setting default shortcut for ${key}: ${defaultShortcuts[key]}`);
            }
            else {
                console.log(`Shortcut for ${key} already exists: ${currentValue}`);
            }
        });
        globalState.update(firstRunKey, true);
        SettingsWizardPanel_1.SettingsWizardPanel.createOrShow(context.extensionUri);
        // Mark the first run as complete
        globalState.update(firstRunKey, true);
    }
    //const openSettingsCommand = vscode.commands.registerCommand('llmCodeCompletion.openSettingsWizard', () => {
    // SettingsWizardPanel.createOrShow(context.extensionUri); // Open the settings wizard
    //});
    //context.subscriptions.push(openSettingsCommand);
    const settings = loadSettings();
    registerDynamicShortcuts(context, settings.shortcuts);
    //updateSettings();  // Set the values from the settings 
    if (displayMode.toLowerCase() === "inline" && triggerMode.toLowerCase() === "proactive") {
        registerInlineCompletionItemProvider(context);
    }
    else {
        if (triggerMode.toLowerCase() === "proactive") {
            vscode.workspace.onDidChangeTextDocument(onTextChanged);
            if (displayMode.toLowerCase() === "tooltip") {
                // Register the completion provider with LLM suggestion for PROACTIVE tooltip display
                registerCompletionProvider();
            }
        }
    }
    /* Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('llmCodeCompletion.triggerSuggestion', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const document = editor.document;
        const position = editor.selection.active;
        await triggerSuggestion(document, position);
      }
    })
  );

  */
    // Register the command to open the chatbot panel
    /*
      context.subscriptions.push(
          vscode.commands.registerCommand('llmCodeCompletion.showChatbot', () => {
        const editor = vscode.window.activeTextEditor;
        
        var documentText= "";
        if (editor) {
          documentText = editor.document.getText();
        }
        
              ChatbotPanel.createOrShow(context.extensionUri, documentText);
          })
    );
  */
    //addButtonsToEditor(context); NON FUNZIONA
    vscode.workspace.onDidChangeConfiguration(onConfigurationChanged);
    console.log("Display mode: " + displayMode);
    console.log("Trigger mode: " + triggerMode);
}
function registerInlineCompletionItemProvider(context) {
    console.log("Registering inline completion provider");
    // Register command to toggle inline suggestions
    const toggleCommand = vscode.commands.registerCommand('llmCodeCompletion.toggleInlineSuggestions', () => {
        if (inlineCompletionDisposable) {
            inlineCompletionDisposable.dispose();
            inlineCompletionDisposable = undefined;
            vscode.window.showInformationMessage('Inline suggestions disabled.');
        }
        else {
            providerInstance = new InlineCompletionProvider_1.InlineCompletionProvider();
            inlineCompletionDisposable = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, // tutti i file
            providerInstance);
            context.subscriptions.push(inlineCompletionDisposable);
            vscode.window.showInformationMessage('Inline suggestions enabled.');
        }
    });
    context.subscriptions.push(toggleCommand);
    triggerInlineSuggestions();
}
/* Callback used by the editor for proactive code completion */
function onTextChanged(event) {
    const idleTime = 2000; // show suggestion after 2 seconds
    const document = event.document;
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    typingTimeout = setTimeout(() => {
        if (hasSufficientContext(document)) {
            const position = event.contentChanges[0]?.range.end || new vscode.Position(0, 0);
            triggerSuggestion(document, position); //COMMENTATA DA CESARE PER TESTARE IL COMPLETIONITEM 
        }
    }, idleTime);
}
// Helper function to trigger inline suggestions in the active editor
function triggerInlineSuggestions() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    }
}
function registerDynamicShortcuts(context, shortcuts) {
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
    console.log("triggering suggestion with Display mode: " + displayMode);
    console.log("triggering suggestion with Trigger mode: " + triggerMode);
    if (!hasSufficientContext(document)) {
        return;
    }
    const contextText = extractContext(document, position);
    const suggestion = await getLLMSuggestion(contextText);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        switch (displayMode) {
            case 'tooltip': // this should only be called when the user asks for a suggestion (not proactively - for that, there is the completionProvider)
                console.log("Showing tooltip suggestion");
                showSuggestionInTooltip(editor, suggestion, position);
                break;
            case 'inline':
                console.log("Showing inline suggestion");
                //showInlineSuggestion(editor, suggestion, position);
                break;
            case 'sideWindow':
                console.log("Showing sidewindow suggestion");
                showSuggestionInSideWindow(suggestion);
                break;
            case 'chatbot':
                console.log("Showing chatbot suggestion");
                //showSuggestionInChatbot(suggestion,contextText);
                break;
            case 'hybrid':
                if (suggestion.length <= inlineMaxLength) {
                    //showInlineSuggestion(editor, suggestion, position);
                }
                else {
                    showSuggestionInSideWindow(suggestion);
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
function hasSufficientContext(document) {
    const MIN_CONTEXT_LENGTH = 10;
    return document.getText().trim().length > MIN_CONTEXT_LENGTH;
}
function extractContext(document, position) {
    // Typing context for the LLM can be adjusted by indicating a range in getText()
    const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    return text;
}
async function getLLMSuggestion(context) {
    let prompt = "";
    prompt = includeDocumentation
        ? `Provide a suggestion with documentation based on the context: ${context}`
        : `Provide a suggestion based on the context: ${context}`;
    // Call the LLM API instead of the placeholder suggestion
    let suggestion = await requestGPT4(prompt);
    return suggestion;
    //let suggestion = new Promise<string>((resolve) => {
    //    setTimeout(() => {
    //      resolve(`// LLM suggestion based on granularity level ${suggestionGranularity}`); // TODO this is a placeholder for the LLM API call
    //    vscode.window.showInformationMessage;
    //    }, 1000);
    //  }
    //);
    // Maybe the documentation might be asked within the prompt, so that getLLMSuggestion would take "includeDocumentation" as an input parameter and change the LLM prompt accordingly
    //let enrichedSuggestion = suggestion;
    //if (includeDocumentation) {
    //  enrichedSuggestion = enrichSuggestionWithDocumentation(await suggestion);
    //}
    //return enrichedSuggestion;
}
async function enrichSuggestionWithDocumentation(suggestion) {
    //TODO get documentation references for functions in suggestion
    return suggestion + `\n\n// Documentation references included.`;
}
/* Suggestion showing functions */
async function showSuggestionInTooltip(editor, suggestion, position) {
    console.log("Showing tooltip suggestion (on-demand)");
    // Create a temporary item completion provider for the tooltip suggestion 
    let disposable = getTooltipCompletionProvider();
    const items = getCompletionItemsWithLLMSuggestion(suggestion);
    // Insert the first suggestion manually, or display the list if needed
    if (items.length > 0) {
        //editor.insertSnippet(new vscode.SnippetString(items[0].insertText as string), position);
        await vscode.commands.executeCommand('editor.action.triggerSuggest');
    }
    // Dispose of the provider when the user starts typing again or changes focus
    const editorDisposable = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === editor.document) {
            disposable.dispose();
            editorDisposable.dispose(); // Cleanup the event listener
        }
    });
    // Also dispose of the provider when the editor loses focus (e.g., the dropdown is dismissed)
    const focusDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
        disposable.dispose();
        focusDisposable.dispose(); // Cleanup the focus listener
    });
}
// Inline suggestion TODO: probabilmente dovremo usare gli InlineCompletionProvider https://code.visualstudio.com/api/references/vscode-api#3414
/*
function showInlineSuggestion(editor: vscode.TextEditor, suggestion: string, position: vscode.Position) {
  if (currentDecorationType) {
    currentDecorationType.dispose();
    vscode.commands.executeCommand('setContext', 'inlineSuggestionVisible', false);
  }

  // Create a new decoration type for the inline suggestion
  currentDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: suggestion,
      color: 'gray',
      fontStyle: 'italic',
    },
  });

  currentSuggestion = suggestion;
  currentPosition = position;

  position = position.translate(0, 4);
  const range = new vscode.Range(position, position);
  editor.setDecorations(currentDecorationType, [{ range }]);
  vscode.commands.executeCommand('setContext', 'inlineSuggestionVisible', true);
}

function showInlineSuggestionItem(editor: vscode.TextEditor, suggestion: string, position: vscode.Position) {
    let completionItem = new vscode.InlineCompletionItem(suggestion);
}
*/
// Lateral window suggestion 
function showSuggestionInSideWindow(suggestion) {
    // TODO: do not create multiple panels => define one panel globally and check if it exists before creating it?
    const panel = vscode.window.createWebviewPanel('codeSuggestion', 'Code Suggestion', vscode.ViewColumn.Beside, {});
    panel.webview.html = `<html><body><pre  style="text-wrap: wrap;">${suggestion}</pre></body></html>`;
}
// Chatbot suggestion (potrebbe non servire)
function showSuggestionInChatbot(suggestion, contextText) {
    vscode.window.showInformationMessage(suggestion);
    ChatbotPanel_1.ChatbotPanel.createOrShow(vscode.extensions.getExtension(extension_id).extensionUri, contextText);
    ChatbotPanel_1.ChatbotPanel.postMessage(suggestion);
}
// Tooltip Suggestion
function getCompletionItemsWithLLMSuggestion(llmSuggestion) {
    const items = [];
    // LLM-generated suggestion (custom completion item)
    const llmCompletionItem = new vscode.CompletionItem(llmSuggestion, vscode.CompletionItemKind.Snippet);
    llmCompletionItem.insertText = llmSuggestion;
    llmCompletionItem.detail = "✨AI-Generated";
    llmCompletionItem.sortText = "000"; // Ensures this item appears at the top
    llmCompletionItem.documentation = new vscode.MarkdownString("This suggestion is generated by an LLM.");
    // Add LLM suggestion as the first item
    items.push(llmCompletionItem);
    return items;
}
function registerCompletionProvider() {
    tooltipProactiveProvider = getTooltipCompletionProvider();
    //context.subscriptions.push(tooltipProactiveProvider);
}
function unregisterCompletionProvider() {
    tooltipProactiveProvider.dispose();
}
/* Returns a completion item provider for the tooltip suggestions */
function getTooltipCompletionProvider() {
    const tooltipProactiveProvider = vscode.languages.registerCompletionItemProvider({ scheme: 'file' }, // Enable for all file-based languages
    {
        provideCompletionItems(document, position, token, completionContext) {
            // Clear any existing typing timeout
            if (typingTimeout) {
                clearTimeout(typingTimeout);
            }
            // Return a Promise that resolves after a delay
            return new Promise((resolve) => {
                // Start a new typing timeout
                typingTimeout = setTimeout(async () => {
                    if (hasSufficientContext(document)) {
                        // Get the LLM suggestion and show them as items in the completion dropdown
                        let typingContext = extractContext(document, position);
                        let llmSuggestion = await getLLMSuggestion(typingContext);
                        const items = getCompletionItemsWithLLMSuggestion(llmSuggestion);
                        resolve(items);
                    }
                    else {
                        resolve([]); // Return empty array if there's insufficient context
                    }
                }, 2000); // Delay for 2000ms (2 seconds)
            });
        },
    });
    return tooltipProactiveProvider;
}
/* ------------------ */
function onConfigurationChanged(event) {
    console.log(`Configuration changed: ${event.affectsConfiguration('llmCodeCompletion.triggerMode')}`);
    if (event.affectsConfiguration('llmCodeCompletion.triggerMode') || event.affectsConfiguration('llmCodeCompletion.displayMode') || event.affectsConfiguration('llmCodeCompletion.suggestionGranularity') || event.affectsConfiguration('llmCodeCompletion.includeDocumentation') || event.affectsConfiguration('llmCodeCompletion.inlineMaxLength')) {
        loadSettings();
        if (event.affectsConfiguration('llmCodeCompletion.triggerMode')) {
            console.log(`Trigger mode changed to ${triggerMode}`);
            if (triggerMode === 'proactive') {
                vscode.workspace.onDidChangeTextDocument(onTextChanged);
                registerCompletionProvider();
            }
            else {
                unregisterCompletionProvider();
                // Set the typing timeout to undefined to prevent proactive behavior FIXME: doesn't work!
                if (typingTimeout) {
                    clearTimeout(typingTimeout);
                    typingTimeout = undefined;
                }
            }
        }
    }
}
/* Updates the global parameters based on the settings specified by the user (or by default) */
function updateSettings() {
    const config = vscode.workspace.getConfiguration(settingsName);
    triggerMode = config.get('triggerMode', triggerMode);
    displayMode = config.get('displayMode', displayMode);
    suggestionGranularity = config.get('suggestionGranularity', suggestionGranularity);
    includeDocumentation = config.get('includeDocumentation', includeDocumentation);
    inlineMaxLength = config.get('inlineMaxLength', inlineMaxLength);
}
/* --------- */
function deactivate() {
    if (inlineCompletionDisposable) {
        inlineCompletionDisposable.dispose();
    }
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
}
function loadSettings() {
    const config = vscode.workspace.getConfiguration('llmCodeCompletion');
    var dm = config.get('displayMode', 'inline'); // Default is 'inline'
    var tm = config.get('triggerMode', 'proactive'); // Default is 'proactive'
    switch (dm) {
        case ("inline"):
            displayMode = settings_1.DisplayMode.Inline;
            break;
        case ("tooltip"):
            displayMode = settings_1.DisplayMode.Tooltip;
            break;
        case ("sideWindow"):
            displayMode = settings_1.DisplayMode.SideWindow;
            break;
        case ("hybrid"):
            displayMode = settings_1.DisplayMode.Hybrid;
    }
    switch (tm) {
        case ("proactive"):
            triggerMode = settings_1.TriggerMode.Proactive;
            break;
        case ("onDemand"):
            triggerMode = settings_1.TriggerMode.OnDemand;
    }
    suggestionGranularity = config.get('suggestionGranularity', 5); // Default is 5
    includeDocumentation = config.get('includeSources', false); // Default is false
    shortcuts = {
        toggleSuggestion: config.get('shortcuts.toggleSuggestion', 'ctrl+alt+s'),
        triggerSuggestion: config.get('shortcuts.triggerSuggestion', 'ctrl+alt+r'),
        openSettings: config.get('shortcuts.openSettings', 'ctrl+alt+t'),
        openChatbot: config.get('shortcuts.openChatbot', 'ctrl+alt+p'),
    };
    return { displayMode, triggerMode, suggestionGranularity, includeDocumentation, shortcuts };
}
async function requestGPT4(prompt) {
    try {
        const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4-turbo',
            messages: [
                { role: 'system', content: 'You are a code completion tool. You must only produce code that completes the input code.' },
                { role: 'user', content: prompt },
            ],
            max_tokens: suggestionGranularity * 20,
            temperature: 0.7,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        });
        console.log(response.data.choices[0].message.content);
        return response.data.choices[0].message.content;
    }
    catch (error) {
        console.error('Error communicating with GPT-4:', error);
        return '';
    }
}
//# sourceMappingURL=extension.js.map