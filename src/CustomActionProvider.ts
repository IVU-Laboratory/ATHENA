import * as vscode from 'vscode';

export class CustomActionProvider implements vscode.CodeActionProvider {

  /*
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  // This method provides code actions when triggered
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    const line = document.lineAt(range.start.line);

    // Example: Only trigger the light bulb for lines containing "TODO"
    if (!line.text.includes('TODO')) {
      return undefined;
    }

    // Create a code action for the "Resolve TODO" functionality
    const action = new vscode.CodeAction('Resolve TODO', vscode.CodeActionKind.QuickFix);
    action.command = {
      command: 'extension.resolveTODO', // This must match a registered command
      title: 'Resolve TODO',
      arguments: [document, range],
    };

    return [action];
  } */

    public static readonly providedCodeActionKinds = [
      vscode.CodeActionKind.QuickFix, 
    ];
  
    provideCodeActions(
      document: vscode.TextDocument,
      range: vscode.Range,
      context: vscode.CodeActionContext,
      token: vscode.CancellationToken
    ): vscode.CodeAction[] | undefined {
      const editor = vscode.window.activeTextEditor;
  
      
      if (!editor || editor.selection.isEmpty) {
        return; // No actions if there's no text selected
      }
  
      // Get the selected range
      const selection = editor.selection;
      const selectedText = document.getText(selection);
  
      
      const explainAction = new vscode.CodeAction(
        'Explain the code',
        vscode.CodeActionKind.QuickFix
      );
      explainAction.command = {
        command: 'extension.explainCode',
        title: 'Explain the code',
        arguments: [selectedText], 
      };
  
      
      const whyAction = new vscode.CodeAction(
        'Why this code?',  // TODO: verificare sia okay come label 
        vscode.CodeActionKind.QuickFix
      );
      whyAction.command = {
        command: 'extension.whyThisCode',
        title: 'Why this code?',
        arguments: [selectedText], 
      };

      const chatbotAction = new vscode.CodeAction(
        'Open in chatbot',
        vscode.CodeActionKind.QuickFix
      );
      chatbotAction.command = {
        command: 'athena.showChatbot',
        title: 'Open in chatbot',
        arguments: [selectedText], 
      };
  
      return [explainAction, whyAction, chatbotAction];
    }
}


/* TO ADD IN EXTENSION.TS

import { MyCodeActionProvider } from './MyCodeActionProvider';


IN ACTIVATE
 const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { scheme: '*'}, // Adjust for your language
    new MyCodeActionProvider(),
    { providedCodeActionKinds: MyCodeActionProvider.providedCodeActionKinds }
  );
  // Add the registration to the context's subscriptions
  context.subscriptions.push(codeActionProvider);

  // Register the "Resolve TODO" command
  const resolveTODOCommand = vscode.commands.registerCommand(
    'extension.resolveTODO',
    (document: vscode.TextDocument, range: vscode.Range) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const line = document.lineAt(range.start.line).text;
      const updatedLine = line.replace('TODO', 'Resolved'); // Replace "TODO" with "Resolved"

      editor.edit((editBuilder) => {
        editBuilder.replace(range, updatedLine);
      });
    }
  );

  // Add the command to the context's subscriptions
  context.subscriptions.push(resolveTODOCommand);


*/