import * as vscode from "vscode";
import { ComponentDataProvider, refreshComponentView, TreeNode } from "./component-data-provider";

export function activate(context: vscode.ExtensionContext) {
  const componentExplorerProvider = new ComponentDataProvider();

  vscode.window.registerTreeDataProvider("component-explorer", componentExplorerProvider);
  vscode.commands.registerCommand("component-explorer.refresh", async () => await refreshComponentView(componentExplorerProvider));
  vscode.commands.registerCommand("component-explorer.import", (node: TreeNode) => vscode.window.showInformationMessage(`Successfully called Import entry on ${node.label}.`));
}

export function deactivate() {}
