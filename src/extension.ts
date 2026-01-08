import * as vscode from "vscode";
import {
  SessionDataProvider,
  TreeNode,
} from "./data-providers/session-view/session-data-provider";
import { TablesDataProvider } from "./data-providers/tables-view/tables-data-provider";
import { ScriptsDataProvider } from "./data-providers/scripts-view/scripts-data-provider";
import { refreshScriptsView } from "./data-providers/scripts-view/script-methods";
import { refreshTablesView } from "./data-providers/tables-view/table-methods";
import { refreshSessionView } from "./data-providers/session-view/session-methods";

export function activate(context: vscode.ExtensionContext) {
  const sessionExplorerProvider = new SessionDataProvider();
  const tableExplorerProvider = new TablesDataProvider();
  const scriptExplorerProvider = new ScriptsDataProvider();

  vscode.window.registerTreeDataProvider("script-explorer", scriptExplorerProvider);
  vscode.commands.registerCommand("script-explorer.refresh", async () => await refreshScriptsView(scriptExplorerProvider));
  vscode.commands.registerCommand("script-explorer.import", (node: TreeNode) => vscode.window.showInformationMessage(`Successfully called Import entry on ${node.label}.`));

  vscode.window.registerTreeDataProvider("table-explorer", tableExplorerProvider);
  vscode.commands.registerCommand("table-explorer.refresh", async () => await refreshTablesView(tableExplorerProvider));
  vscode.commands.registerCommand("table-explorer.import", (node: TreeNode) => vscode.window.showInformationMessage(`Successfully called Import entry on ${node.label}.`));
  
  vscode.window.registerTreeDataProvider("session-explorer", sessionExplorerProvider);
  vscode.commands.registerCommand("session-explorer.refresh", async () => await refreshSessionView(sessionExplorerProvider));
  vscode.commands.registerCommand("session-explorer.import", (node: TreeNode) => vscode.window.showInformationMessage(`Successfully called Import entry on ${node.label}.`));
}

export function deactivate() {}
