import * as vscode from "vscode";
import { FunctionDocDatabase } from "../function-doc-database";
import { BaanCDocumentParser } from "../parsers/document-parser";

/**
 * Provides hover information for BaanC functions
 */
export class BaanCHoverProvider implements vscode.HoverProvider {
  constructor(private docDatabase: FunctionDocDatabase) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Hover> {
    const word = BaanCDocumentParser.getWordAtPosition(document, position);
    if (!word) {
      return null;
    }

    // Get function documentation
    const doc = this.docDatabase.getFunctionDoc(word);
    if (!doc) {
      return null;
    }

    // Build hover content
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    // Function syntax
    markdown.appendCodeblock(doc.syntax, "baanc");

    // Description
    if (doc.description) {
      markdown.appendMarkdown(`\n${doc.description}\n`);
    }

    // Arguments
    if (doc.arguments && doc.arguments.length > 0) {
      markdown.appendMarkdown("\n**Parameters:**\n\n");
      for (const arg of doc.arguments) {
        markdown.appendMarkdown(
          `- \`${arg.name}\` (*${arg.type}*): ${arg.description}\n`,
        );
      }
    }

    // Return value
    if (doc.returnValue) {
      markdown.appendMarkdown(`\n**Returns:** ${doc.returnValue}\n`);
    }

    // Category
    if (doc.category) {
      markdown.appendMarkdown(`\n*Category: ${doc.category}*\n`);
    }

    return new vscode.Hover(markdown);
  }
}
