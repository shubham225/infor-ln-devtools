import * as vscode from "vscode";
import { FunctionDocDatabase } from "../function-doc-database";
import { BaanCDocumentParser } from "../parsers/document-parser";
import { FunctionDocDB } from "../types";

/**
 * Provides code completion for BaanC
 * Includes functions, keywords, variables, and user-defined items
 */
export class BaanCCompletionProvider
  implements vscode.CompletionItemProvider
{
  private keywords: string[] = [
    "if",
    "then",
    "else",
    "endif",
    "while",
    "endwhile",
    "for",
    "to",
    "step",
    "endfor",
    "repeat",
    "until",
    "return",
    "break",
    "continue",
    "case",
    "default",
    "endcase",
    "function",
    "extern",
    "static",
    "based",
    "fixed",
    "mb",
    "selectdo",
    "selectempty",
    "endselect",
    "declaration",
    "functions",
  ];

  private types: string[] = [
    "long",
    "double",
    "string",
    "boolean",
    "domain",
    "table",
  ];

  private constants: string[] = ["true", "false", "empty"];

  constructor(private docDatabase: FunctionDocDatabase) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext,
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const items: vscode.CompletionItem[] = [];

    // Add basic keywords
    for (const keyword of this.keywords) {
      const item = new vscode.CompletionItem(
        keyword,
        vscode.CompletionItemKind.Keyword,
      );
      item.detail = "Keyword";
      item.sortText = `0_${keyword}`;  // Sort keywords first
      items.push(item);
    }

    // Add types
    for (const type of this.types) {
      const item = new vscode.CompletionItem(
        type,
        vscode.CompletionItemKind.TypeParameter,
      );
      item.detail = "Type";
      item.sortText = `1_${type}`;
      items.push(item);
    }

    // Add constants
    for (const constant of this.constants) {
      const item = new vscode.CompletionItem(
        constant,
        vscode.CompletionItemKind.Constant,
      );
      item.detail = "Constant";
      item.sortText = `2_${constant}`;
      items.push(item);
    }

    // Add built-in functions
    const functionNames = this.docDatabase.getAllFunctionNames();
    for (const funcName of functionNames) {
      const doc = this.docDatabase.getFunctionDoc(funcName);
      if (doc) {
        const item = this.createFunctionCompletionItem(doc);
        item.sortText = `3_${funcName}`;
        items.push(item);
      }
    }

    // Add 4GL keywords and predefined variables
    const keywordNames = this.docDatabase.getAllKeywordNames();
    for (const keywordName of keywordNames) {
      const doc = this.docDatabase.getKeywordDoc(keywordName);
      if (doc) {
        if (doc.type === 'variable') {
          const item = this.createVariableCompletionItem(doc);
          item.sortText = `2_${keywordName}`;  // Variables sort with constants
          items.push(item);
        } else if (doc.type === 'keyword') {
          const item = this.createKeywordCompletionItem(doc);
          item.sortText = `0_${keywordName}`;  // Keywords sort first
          items.push(item);
        }
      }
    }

    // Add user-defined functions from current document
    const functions = BaanCDocumentParser.parseFunctions(document);
    for (const func of functions) {
      const item = new vscode.CompletionItem(
        func.name,
        vscode.CompletionItemKind.Function,
      );
      item.detail = `User-defined: ${func.returnType} ${func.name}()`;
      item.documentation = `Parameters: ${func.parameters.join(", ")}`;
      item.sortText = `4_${func.name}`;
      items.push(item);
    }

    // Add user-defined variables from current document
    const variables = BaanCDocumentParser.parseVariables(document);
    for (const variable of variables) {
      const item = new vscode.CompletionItem(
        variable.name,
        vscode.CompletionItemKind.Variable,
      );
      item.detail = `${variable.type}`;
      item.sortText = `5_${variable.name}`;
      items.push(item);
    }

    return items;
  }

  /**
   * Create completion item for functions
   */
  private createFunctionCompletionItem(doc: FunctionDocDB): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      doc.name,
      vscode.CompletionItemKind.Function,
    );
    
    item.detail = doc.syntax || `function ${doc.name}()`;
    item.documentation = new vscode.MarkdownString(doc.description);

    // Add snippet for function with parameters
    if (doc.arguments && doc.arguments.length > 0) {
      const params = doc.arguments
        .map((arg, index) => `\${${index + 1}:${arg.name}}`)
        .join(", ");
      item.insertText = new vscode.SnippetString(`${doc.name}(${params})`);
    } else {
      item.insertText = new vscode.SnippetString(`${doc.name}($1)`);
    }

    return item;
  }

  /**
   * Create completion item for variables
   */
  private createVariableCompletionItem(doc: FunctionDocDB): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      doc.name,
      vscode.CompletionItemKind.Variable,
    );
    
    item.detail = `${doc.dataType} - ${doc.attributes || 'Predefined'}`;
    item.documentation = new vscode.MarkdownString(doc.description);
    
    return item;
  }

  /**
   * Create completion item for keywords
   */
  private createKeywordCompletionItem(doc: FunctionDocDB): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      doc.name,
      vscode.CompletionItemKind.Keyword,
    );
    
    item.detail = `4GL Section - ${doc.context || 'Keyword'}`;
    item.documentation = new vscode.MarkdownString(doc.description);
    
    return item;
  }
}
