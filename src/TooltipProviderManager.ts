import * as vscode from 'vscode';
import {hasSufficientContext, extractContext} from './utilities/context';
import {GPTSessionManager} from './GPT';

export class TooltipProviderManager {
    private proactiveProvider: vscode.Disposable | null = null;
    private typingTimeout: NodeJS.Timeout | undefined;
    private cachedSuggestions = new Map<string, vscode.CompletionItem[]>();

    public enableProactiveBehavior(): vscode.Disposable {
        const debounceTimers = new Map<string, NodeJS.Timeout>();
    
        const registerProvider = () => {
            if (this.proactiveProvider) {
                this.proactiveProvider.dispose();
            }
    
            const _this = this; // prevent outshadow of "this" 
            this.proactiveProvider = vscode.languages.registerCompletionItemProvider({ pattern: '**' }, {
                async provideCompletionItems(document, position) {
                    const docUri = document.uri.toString();

                    // Serve cached suggestions if available
                    if (_this.cachedSuggestions.has(docUri)) {
                        const items = _this.cachedSuggestions.get(docUri)!;
                        _this.cachedSuggestions.delete(docUri); // Clear cache after use
                        return items;
                    }
    
                    // If no suggestions are ready, return an empty array
                    return [];
                }
            });
        };
    
        const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
            const document = event.document;
            const docUri = document.uri.toString();
    
            // Clear any existing timer for this document
            if (debounceTimers.has(docUri)) {
                clearTimeout(debounceTimers.get(docUri)!);
            }
    
            // Start a new timer
            const timer = setTimeout(async () => {
                const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === docUri);
                if (!editor) return;
    
                const position = editor.selection.active;
                const suggestions = await this.getCompletionItems(document, position);
    
                // Cache suggestions
                this.cachedSuggestions.set(docUri, suggestions);
    
                // Trigger suggestion dropdown
                vscode.commands.executeCommand('editor.action.triggerSuggest');
    
                debounceTimers.delete(docUri);
            }, 2000); // 2-second idle time
    
            debounceTimers.set(docUri, timer);
        });
    
        // Register the initial provider
        registerProvider();
    
        return {
            dispose: () => {
                changeListener.dispose();
                debounceTimers.forEach(timer => clearTimeout(timer));
                debounceTimers.clear();
                this.disableProactiveBehavior();
            }
        };
    }

    
    public disableProactiveBehavior(): void {
        // destroy proactive provider  
        if (this.proactiveProvider) {
            this.proactiveProvider.dispose();
            this.proactiveProvider = null;
        }
        // Clear cache
        this.cachedSuggestions.clear();
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
        const temporaryProvider = this.registerTemporaryProvider();

        // Trigger suggestion dropdown
        await vscode.commands.executeCommand('editor.action.triggerSuggest');

        // Clean up on changes
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

    private registerTemporaryProvider(): vscode.Disposable {
        console.log ("Registering a temporary tooltip provider")
        const _this = this;
        return vscode.languages.registerCompletionItemProvider({ pattern: '**' }, {
            provideCompletionItems(document, position, token, completionContext) {
                return _this.getCompletionItems(document, position);
            }
        });
    }


    private getCompletionItems(
      document: vscode.TextDocument, 
      position: vscode.Position): 
      Promise<vscode.CompletionItem[]>{
      return new Promise<vscode.CompletionItem[]>(async (resolve) => {
        try {
          // Check if sufficient context is available
          if (hasSufficientContext(document)) { 
            console.log("Calling tooltip completion inside provider");

            // Extract context and get LLM suggestions
            const typingContext = extractContext(document, position);
            const llmSuggestion = await GPTSessionManager.getLLMSuggestion(typingContext);

            const llmCompletionItem = new vscode.CompletionItem(llmSuggestion, vscode.CompletionItemKind.Snippet);
            llmCompletionItem.insertText = llmSuggestion;
            llmCompletionItem.detail = "✨AI-Generated";
            llmCompletionItem.sortText = "000"; // Ensures this item appears at the top
            llmCompletionItem.documentation = new vscode.MarkdownString("This suggestion is generated by an LLM.");
          
            const items = [llmCompletionItem];
            resolve(items);
          } else {
            resolve([]); // Return empty array if insufficient context
          }
        } catch (error) {
          console.error("Error in tooltip completion provider:", error);
          resolve([]); // Return empty array in case of error
        }
      });
    }

}
