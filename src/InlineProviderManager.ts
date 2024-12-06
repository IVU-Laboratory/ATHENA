
import * as vscode from 'vscode';
import {InlineCompletionProvider} from "./InlineCompletionProvider";

export class InlineProviderManager {

    private proactiveProvider: vscode.Disposable | null = null;
    private typingTimeout: NodeJS.Timeout | undefined;
    
    public enableProactiveBehavior(): vscode.Disposable {
        console.log("Registering inline completion provider");
        const debounceTimers = new Map<string, NodeJS.Timeout>();
        const providerInstance = new InlineCompletionProvider();

        this.proactiveProvider = vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**' }, // tutti i file
            providerInstance
        );

        // Listen for text changes to trigger inline completions
        const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            // Ignore if no active editor or wrong document
            if (!editor || editor.document !== event.document) {
                return;
            }
            vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        });

        return {
            dispose: () => {
                this.disableProactiveBehavior();
                debounceTimers.forEach(timer => clearTimeout(timer));
                debounceTimers.clear();
                changeListener.dispose();
            }
        };
    }


    public disableProactiveBehavior() {
        console.log("Unregistering tooltip completion provider");
        // destroy proactive provider  
        if (this.proactiveProvider) {
            this.proactiveProvider.dispose();
            this.proactiveProvider = null;
        }
        // Clear timer
        if (this.typingTimeout) {
          clearTimeout(this.typingTimeout);
        }
    }


    public async provideOnDemandSuggestion(
        editor: vscode.TextEditor,
        suggestion: string,
        position: vscode.Position
    ): Promise<void> {
        if (editor) {
            let temporaryProvider = vscode.languages.registerInlineCompletionItemProvider(
                { pattern: '**' }, // tutti i file
                {
                    provideInlineCompletionItems(): vscode.InlineCompletionItem[] {
                        const item = new vscode.InlineCompletionItem(suggestion);
                        item.insertText = suggestion;
                        return [item];
                    } 
                }
            );
            await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
            
            // Clean up temporary provider on changes
            const disposables: vscode.Disposable[] = [];
            disposables.push(
                vscode.workspace.onDidChangeTextDocument(event => {
                    if (event.document === editor.document) {
                        temporaryProvider.dispose();
                        disposables.forEach(disposable => disposable.dispose());
                    }
                }),
                vscode.window.onDidChangeActiveTextEditor(() => {
                    temporaryProvider.dispose();
                    disposables.forEach(disposable => disposable.dispose());
                })
            );
        }
    }
}
