import * as path from "path";
import * as vscode from "vscode";

export class TreeNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children: TreeNode[] = []
  ) {
    super(label, collapsibleState);
    this.iconPath = path.join(
      __filename,
      "..",
      "..",
      "resources",
      "dependency.svg"
    );
    this.contextValue = children.length > 0 ? "folderNode" : "leafNode";
  }
}

export class TablesDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    TreeNode | undefined | null | void
  > = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    TreeNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private data: TreeNode[] = [];

  refresh(data: TreeNode[]) {
    this.data = data;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    return Promise.resolve(element ? element.children : this.data);
  }
}
