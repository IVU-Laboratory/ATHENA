import * as vscode from 'vscode';
import axios from 'axios';

const apiKey = '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'; 



export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {

    // Define the method to provide inline completion items
    async provideInlineCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      context: vscode.InlineCompletionContext,
      token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList | undefined> {
      
      const textBeforeCursor = document.getText(
        new vscode.Range(new vscode.Position(position.line, 0), position)
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

async function requestGPT4(prompt: string): Promise<string> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4-turbo',
          messages: [
            { role: 'system', content: 'You are a code completion tool. You must only produce code that completes the input code. ' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 100,
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
        }
      );
  
      console.log(response.data.choices[0].message.content);
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error communicating with GPT-4:', error);
      return '';
    }
  }
