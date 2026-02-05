import * as vscode from "vscode";
import { FunctionDocDatabase } from "../function-doc-database";

/**
 * Provides signature help (parameter hints) for BaanC functions
 */
export class BaanCSignatureHelpProvider
  implements vscode.SignatureHelpProvider
{
  constructor(private docDatabase: FunctionDocDatabase) {}

  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.SignatureHelpContext,
  ): vscode.ProviderResult<vscode.SignatureHelp> {
    // Get the line up to the cursor position
    const line = document.lineAt(position.line).text.substring(0, position.character);

    // Find the function call we're currently in
    const functionMatch = this.findCurrentFunctionCall(line);
    if (!functionMatch) {
      return null;
    }

    const functionName = functionMatch.name;
    const currentParam = functionMatch.paramIndex;

    // Get function documentation
    const doc = this.docDatabase.getFunctionDoc(functionName);
    if (!doc) {
      return null;
    }

    const signatureHelp = new vscode.SignatureHelp();
    const signature = new vscode.SignatureInformation(doc.syntax);
    signature.documentation = new vscode.MarkdownString(doc.description);

    // Add parameters
    if (doc.arguments) {
      for (const arg of doc.arguments) {
        const paramInfo = new vscode.ParameterInformation(
          arg.name,
          new vscode.MarkdownString(`*${arg.type}*: ${arg.description}`),
        );
        signature.parameters.push(paramInfo);
      }
    }

    signatureHelp.signatures.push(signature);
    signatureHelp.activeSignature = 0;
    signatureHelp.activeParameter = Math.min(
      currentParam,
      signature.parameters.length - 1,
    );

    return signatureHelp;
  }

  /**
   * Find the current function call and parameter index
   */
  private findCurrentFunctionCall(
    line: string,
  ): { name: string; paramIndex: number } | null {
    // Find the last opening parenthesis
    let parenDepth = 0;
    let lastOpenParen = -1;

    for (let i = line.length - 1; i >= 0; i--) {
      if (line[i] === ")") {
        parenDepth++;
      } else if (line[i] === "(") {
        if (parenDepth === 0) {
          lastOpenParen = i;
          break;
        }
        parenDepth--;
      }
    }

    if (lastOpenParen === -1) {
      return null;
    }

    // Extract function name before the opening parenthesis
    const beforeParen = line.substring(0, lastOpenParen).trim();
    const functionNameMatch = beforeParen.match(/([a-z_][a-z0-9._]*)\s*$/i);
    if (!functionNameMatch) {
      return null;
    }

    const functionName = functionNameMatch[1];

    // Count commas to determine parameter index
    const insideParens = line.substring(lastOpenParen + 1);
    let paramIndex = 0;
    parenDepth = 0;

    for (const char of insideParens) {
      if (char === "(") {
        parenDepth++;
      } else if (char === ")") {
        parenDepth--;
      } else if (char === "," && parenDepth === 0) {
        paramIndex++;
      }
    }

    return { name: functionName, paramIndex };
  }
}
