import * as vscode from 'vscode';

export class CustomActionProvider implements vscode.CodeActionProvider {
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