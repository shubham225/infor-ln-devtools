import * as vscode from "vscode";

export interface ParsedFunction {
  name: string;
  range: vscode.Range;
  parameters: string[];
  returnType: string;
}

export interface ParsedVariable {
  name: string;
  type: string;
  range: vscode.Range;
}

/**
 * Parser for BaanC documents to extract symbols for IntelliSense
 */
export class BaanCDocumentParser {
  /**
   * Parse document to find all function definitions
   */
  static parseFunctions(document: vscode.TextDocument): ParsedFunction[] {
    const functions: ParsedFunction[] = [];
    const text = document.getText();

    // Match function declarations: function <type> <name>(<params>)
    const functionRegex =
      /function\s+(long|double|string|boolean|domain|void)\s+([a-z_][a-z0-9._]*)\s*\((.*?)\)/gi;

    let match;
    while ((match = functionRegex.exec(text)) !== null) {
      const returnType = match[1];
      const name = match[2];
      const paramsStr = match[3];

      const parameters = paramsStr
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const position = document.positionAt(match.index);
      const endPosition = document.positionAt(match.index + match[0].length);

      functions.push({
        name,
        range: new vscode.Range(position, endPosition),
        parameters,
        returnType,
      });
    }

    return functions;
  }

  /**
   * Parse document to find all variable declarations
   */
  static parseVariables(document: vscode.TextDocument): ParsedVariable[] {
    const variables: ParsedVariable[] = [];
    const text = document.getText();

    // Match variable declarations: <type> <name>
    const varRegex =
      /^[ \t]*(long|double|string|boolean|domain)\s+([a-z_][a-z0-9._]*)/gim;

    let match;
    while ((match = varRegex.exec(text)) !== null) {
      const type = match[1];
      const name = match[2];

      const position = document.positionAt(match.index);
      const endPosition = document.positionAt(match.index + match[0].length);

      variables.push({
        name,
        type,
        range: new vscode.Range(position, endPosition),
      });
    }

    return variables;
  }

  /**
   * Find function calls in document for go-to-definition
   */
  static findFunctionCalls(
    document: vscode.TextDocument,
  ): Map<string, vscode.Range[]> {
    const calls = new Map<string, vscode.Range[]>();
    const text = document.getText();

    // Match function calls: <name>(<params>)
    const callRegex = /\b([a-z_][a-z0-9._]*)\s*\(/gi;

    let match;
    while ((match = callRegex.exec(text)) !== null) {
      const name = match[1];
      const position = document.positionAt(match.index);
      const endPosition = document.positionAt(
        match.index + match[1].length,
      );
      const range = new vscode.Range(position, endPosition);

      if (!calls.has(name)) {
        calls.set(name, []);
      }
      calls.get(name)!.push(range);
    }

    return calls;
  }

  /**
   * Get word at position
   */
  static getWordAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): string | undefined {
    const wordRange = document.getWordRangeAtPosition(
      position,
      /[a-z_][a-z0-9._]*/i,
    );
    if (wordRange) {
      return document.getText(wordRange);
    }
    return undefined;
  }
}
