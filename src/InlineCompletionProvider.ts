import * as vscode from 'vscode';
import {GPTSessionManager} from './GPT';
import {hasSufficientContext, extractContextBeforeCursor} from './utilities/context';


export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {

    private cachedSuggestions = new Map<string, vscode.InlineCompletionItem[]>();
    private debounceTimers = new Map<string, NodeJS.Timeout>(); // Track debounce timers for each document
    private readonly DEBOUNCE_MS = 2000; // 2 seconds of idle time
    private activeRequests = new Set<string>();  // used for computation lock

    // Define the method to provide inline completion items
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList | undefined> {
        const docUri = document.uri.toString();

        // Skip duplicate computations for the same line and character
        const cacheKey = `${docUri}:${position.line}:${position.character}`;
        if (this.activeRequests.has(cacheKey)) {
            return undefined;
        }
        this.activeRequests.add(cacheKey); // Track active computation

        // Clear any existing debounce timer for this document
        if (this.debounceTimers.has(docUri)) {
            clearTimeout(this.debounceTimers.get(docUri)!);
        }

        // Return a promise that resolves after the debounce delay
        return new Promise<vscode.InlineCompletionList | undefined>((resolve) => {
            const timer = setTimeout(async () => {
                try {
                    if (hasSufficientContext(document)) {
                        // Serve cached suggestions if available
                        if (this.cachedSuggestions.has(docUri)) {
                            const items = this.cachedSuggestions.get(docUri)!;
                            this.cachedSuggestions.delete(docUri); // Clear cache after use
                            resolve(new vscode.InlineCompletionList(items));
                            return;
                        }

                        // Extract context and get LLM suggestions
                        const typingContext = extractContextBeforeCursor(document, position);
                        if (this.shouldProvideSuggestion(typingContext)) {
                            console.log("Fetching inline suggestion...");
                            const suggestionText = await GPTSessionManager.getLLMSuggestion(typingContext);

                            if (!suggestionText) {
                                resolve(undefined);
                                console.log ("undefined suggestion!")
                                return;
                            }

                            // Create an InlineCompletionItem with the suggestion text
                            const inlineCompletionItem = new vscode.InlineCompletionItem(suggestionText);
                            inlineCompletionItem.insertText = suggestionText;

                            // Cache the suggestion for this document
                            this.cachedSuggestions.set(docUri, [inlineCompletionItem]);

                            // Return the suggestion wrapped in an InlineCompletionList
                            resolve(new vscode.InlineCompletionList([inlineCompletionItem]));
                        } else {
                            resolve(undefined); // No suggestion to provide
                        }
                    } else {
                        resolve(undefined); // Insufficient context
                    }
                } catch (error) {
                    console.error("Error in inline completion provider:", error);
                    resolve(undefined); // Resolve with no suggestions on error
                }
            }, this.DEBOUNCE_MS);

            // Save the new debounce timer for this document
            this.debounceTimers.set(docUri, timer);
        });
    }

    private shouldProvideSuggestion(text: string): boolean {
        // Define your conditions here. For example:
        // return text.endsWith(';') || text.endsWith('}');
        console.log ("Should provide suggestion? " + text.endsWith(' '));
        if (text.endsWith(' ')) return false;
        return true;
    }


}
