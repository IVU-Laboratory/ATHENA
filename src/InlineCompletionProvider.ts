import * as vscode from 'vscode';
import {requestGPT4} from './GPT';


export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    
    // Define the method to provide inline completion items
    async provideInlineCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      context: vscode.InlineCompletionContext,
      token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList | undefined> {
      
      const textBeforeCursor = document.getText(
        new vscode.Range(new vscode.Position(0, 0), position)
      );
  
      // Call the requestGPT4 function to get suggestions (ensure this function is available here)
      const suggestionText = await requestGPT4(textBeforeCursor);
      //print the suggestion
      console.log(suggestionText);
      if (!suggestionText) {
        return undefined;
      }
  
      // Create an InlineCompletionItem with the suggestion text
      const inlineCompletionItem = new vscode.InlineCompletionItem(suggestionText);
      inlineCompletionItem.insertText = suggestionText;
  
      // Return the suggestion wrapped in an InlineCompletionList
      return new vscode.InlineCompletionList([inlineCompletionItem]);
    }

    private shouldProvideSuggestion(text: string): boolean {
      // Define your conditions here. For example:
      // return text.endsWith(';') || text.endsWith('}');
      return true;
    }
}
