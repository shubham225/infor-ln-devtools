import * as vscode from "vscode";
import { Component } from "../types/api";

export class TreeNode extends vscode.TreeItem {
  public readonly component?: Component;
  filterText?: string;

  constructor(
    public readonly label: string,
    public readonly description: string = "",
    public readonly componentType: string = "",
    public readonly contextType: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public children: TreeNode[] = [],
    public readonly parent?: TreeNode,
    component?: Component,
  ) {
    super(label, collapsibleState);
    this.component = component;
    const iconId =
      {
        rootNode:
          {
            Table: "table",
            Session: "window",
            Script: "code",
            Domain: "library",
            Report: "graph",
            Function: "symbol-function",
          }[componentType] || "symbol-misc",
        packageNode: "symbol-folder",
        moduleNode: "folder",
      }[contextType] ||
      {
        Table: "table",
        Session: "window",
        Script: "code",
        Domain: "library",
        Report: "graph",
        Function: "symbol-function",
      }[component?.type || "symbol-misc"] ||
      "symbol-misc";

    if (iconId) {
      this.iconPath = new vscode.ThemeIcon(iconId);
    } else {
      // Fallback to custom SVG
      this.iconPath = {
        light: vscode.Uri.joinPath(
          vscode.extensions.getExtension("shubham-shinde.infor-ln-devtools")!
            .extensionUri,
          "resources",
          "infor-ln-logo.svg",
        ),
        dark: vscode.Uri.joinPath(
          vscode.extensions.getExtension("shubham-shinde.infor-ln-devtools")!
            .extensionUri,
          "resources",
          "infor-ln-logo.svg",
        ),
      };
    }
    this.contextValue = contextType;
    this.filterText = `${label} ${description}`.toLowerCase();
  }
}
