import * as vscode from "vscode";
import { BaanCDocumentParser } from "../parsers/document-parser";
import * as fs from "fs";
import * as path from "path";

/**
 * Provides go-to-definition for BaanC functions
 */
export class BaanCDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    const word = BaanCDocumentParser.getWordAtPosition(document, position);
    if (!word) {
      return null;
    }

    // First, check if the function is defined in the current document
    const functions = BaanCDocumentParser.parseFunctions(document);
    for (const func of functions) {
      if (func.name.toLowerCase() === word.toLowerCase()) {
        return new vscode.Location(document.uri, func.range);
      }
    }

    // If not found in current document, search in workspace
    return this.searchInWorkspace(word, document);
  }

  /**
   * Search for function definition in workspace
   */
  private async searchInWorkspace(
    functionName: string,
    currentDocument: vscode.TextDocument,
  ): Promise<vscode.Location | null> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      currentDocument.uri,
    );
    if (!workspaceFolder) {
      return null;
    }

    // Find all .bc files in workspace
    const files = await vscode.workspace.findFiles(
      "**/*.bc",
      "**/node_modules/**",
      100,
    );

    for (const fileUri of files) {
      // Skip current document
      if (fileUri.toString() === currentDocument.uri.toString()) {
        continue;
      }

      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const functions = BaanCDocumentParser.parseFunctions(document);

        for (const func of functions) {
          if (func.name.toLowerCase() === functionName.toLowerCase()) {
            return new vscode.Location(fileUri, func.range);
          }
        }
      } catch (error) {
        // Ignore errors for individual files
        console.error(`Error reading ${fileUri.fsPath}:`, error);
      }
    }

    return null;
  }
}
