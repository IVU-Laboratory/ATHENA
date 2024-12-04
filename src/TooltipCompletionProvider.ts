import * as vscode from 'vscode';
import {hasSufficientContext, extractContext} from './utilities/context';
import {getLLMSuggestion} from './GPT'

export class TooltipProviderManager {
    private proactiveProvider: vscode.Disposable | null = null;
    private typingTimeout: NodeJS.Timeout | undefined;


    public enableProactiveBehavior(): vscode.Disposable {

        const debounceTimers = new Map<string, NodeJS.Timeout>();
        const registerProvider = () => {
            if (this.proactiveProvider) {
                this.proactiveProvider.dispose();
            }
    
            const _this = this;  // prevent outshadow of "this" 
            this.proactiveProvider = vscode.languages.registerCompletionItemProvider({ pattern: '**' }, {
                async provideCompletionItems(document, position) {
                    const docUri = document.uri.toString();
    
                    if (!debounceTimers.has(docUri)) {
                        return []; // Skip if no suggestions are ready
                    }
                    return new Promise<vscode.CompletionItem[]>((resolve) => {
                        // Resolve suggestions after debouncing
                        const timer = debounceTimers.get(docUri)!;
                        clearTimeout(timer);
                        debounceTimers.delete(docUri);
                        _this.getCompletionItems(document, position).then(resolve);
                    });
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
                await this.getCompletionItems(document, position);
                
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
                if (this.proactiveProvider) {
                    this.proactiveProvider.dispose();
                }
            }
        };
    }


    public disableProactiveBehavior(): void {
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
        const temporaryProvider = this.registerTemporaryProvider(this.getCompletionItems);

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

    private registerTemporaryProvider(
        getCompletionItems: (
          document: vscode.TextDocument, 
          position: vscode.Position) => Promise<vscode.CompletionItem[]>
    ): vscode.Disposable {
        console.log ("Registering a temporary tooltip provider")
        return vscode.languages.registerCompletionItemProvider({ pattern: '**' }, {
            provideCompletionItems(document, position, token, completionContext) {
                return getCompletionItems(document, position);
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
            const llmSuggestion = await getLLMSuggestion(typingContext);

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
