import * as vscode from 'vscode'

export function hasSufficientContext(document: vscode.TextDocument): boolean {
  const MIN_CONTEXT_LENGTH = 10;
  return document.getText().trim().length > MIN_CONTEXT_LENGTH;
}


export function extractContext(document: vscode.TextDocument, position: vscode.Position): string {
  // Typing context for the LLM can be adjusted by indicating a range in getText()
  return document.getText(new vscode.Range(new vscode.Position(0, 0), position)); 
}


export function extractContextBeforeCursor(document: vscode.TextDocument, position: vscode.Position): string {
  return document.getText(
    new vscode.Range(new vscode.Position(0, 0), position)
  );
}