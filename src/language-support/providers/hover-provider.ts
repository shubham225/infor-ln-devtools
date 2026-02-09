import * as vscode from "vscode";
import { FunctionDocDatabase } from "../function-doc-database";
import { BaanCDocumentParser} from "../parsers/document-parser";
import { FunctionDocDB } from "../types";

/**
 * Provides hover information for BaanC functions, keywords, and variables
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

    // Get documentation (searches both functions and keywords)
    const doc = this.docDatabase.getDoc(word);
    if (!doc) {
      return null;
    }

    // Build hover content based on type
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    if (doc.type === 'function') {
      return this.buildFunctionHover(doc, markdown);
    } else if (doc.type === 'variable') {
      return this.buildVariableHover(doc, markdown);
    } else if (doc.type === 'keyword') {
      return this.buildKeywordHover(doc, markdown);
    } else {
      return this.buildConceptHover(doc, markdown);
    }
  }

  /**
   * Build hover for functions
   */
  private buildFunctionHover(doc: FunctionDocDB, markdown: vscode.MarkdownString): vscode.Hover {
    // Function syntax
    if (doc.syntax) {
      markdown.appendCodeblock(doc.syntax, "baanc");
    }

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

  /**
   * Build hover for variables
   */
  private buildVariableHover(doc: FunctionDocDB, markdown: vscode.MarkdownString): vscode.Hover {
    // Variable name and type
    markdown.appendCodeblock(`${doc.dataType} ${doc.name}`, "baanc");

    // Attributes
    if (doc.attributes) {
      markdown.appendMarkdown(`\n**Attributes:** ${doc.attributes}\n`);
    }

    // Description
    if (doc.description) {
      markdown.appendMarkdown(`\n${doc.description}\n`);
    }

    // Category
    markdown.appendMarkdown(`\n*Type: Predefined Variable*\n`);

    return new vscode.Hover(markdown);
  }

  /**
   * Build hover for keywords (4GL sections)
   */
  private buildKeywordHover(doc: FunctionDocDB, markdown: vscode.MarkdownString): vscode.Hover {
    // Keyword name
    markdown.appendCodeblock(doc.name, "baanc");

    // Context
    if (doc.context) {
      markdown.appendMarkdown(`\n**Context:** ${doc.context}\n`);
    }

    // Description
    if (doc.description) {
      markdown.appendMarkdown(`\n${doc.description}\n`);
    }

    // Category
    markdown.appendMarkdown(`\n*Type: 4GL Section Keyword*\n`);

    return new vscode.Hover(markdown);
  }

  /**
   * Build hover for concepts (3GL features)
   */
  private buildConceptHover(doc: FunctionDocDB, markdown: vscode.MarkdownString): vscode.Hover {
    // Concept name
    markdown.appendMarkdown(`### ${doc.name}\n\n`);

    // Context
    if (doc.context) {
      markdown.appendMarkdown(`**From:** ${doc.context}\n\n`);
    }

    // Description
    if (doc.description) {
      markdown.appendMarkdown(`${doc.description}\n`);
    }

    return new vscode.Hover(markdown);
  }
}
