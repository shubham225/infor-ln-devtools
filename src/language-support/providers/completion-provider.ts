import * as vscode from "vscode";
import { FunctionDocDatabase } from "../function-doc-database";
import { BaanCDocumentParser } from "../parsers/document-parser";

/**
 * Provides code completion for BaanC
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

    // Add keywords
    for (const keyword of this.keywords) {
      const item = new vscode.CompletionItem(
        keyword,
        vscode.CompletionItemKind.Keyword,
      );
      item.detail = "Keyword";
      items.push(item);
    }

    // Add types
    for (const type of this.types) {
      const item = new vscode.CompletionItem(
        type,
        vscode.CompletionItemKind.TypeParameter,
      );
      item.detail = "Type";
      items.push(item);
    }

    // Add constants
    for (const constant of this.constants) {
      const item = new vscode.CompletionItem(
        constant,
        vscode.CompletionItemKind.Constant,
      );
      item.detail = "Constant";
      items.push(item);
    }

    // Add built-in functions from documentation
    const functionNames = this.docDatabase.getAllFunctionNames();
    for (const funcName of functionNames) {
      const doc = this.docDatabase.getFunctionDoc(funcName);
      if (doc) {
        const item = new vscode.CompletionItem(
          funcName,
          vscode.CompletionItemKind.Function,
        );
        item.detail = doc.syntax;
        item.documentation = new vscode.MarkdownString(doc.description);

        // Add snippet for function with parameters
        if (doc.arguments && doc.arguments.length > 0) {
          const params = doc.arguments
            .map((arg, index) => `\${${index + 1}:${arg.name}}`)
            .join(", ");
          item.insertText = new vscode.SnippetString(`${funcName}(${params})`);
        } else {
          item.insertText = new vscode.SnippetString(`${funcName}($1)`);
        }

        items.push(item);
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
      items.push(item);
    }

    return items;
  }
}
