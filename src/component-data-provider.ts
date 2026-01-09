import * as path from "path";
import * as vscode from "vscode";
import axios from "axios";

export class TreeNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly contextType: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children: TreeNode[] = []
  ) {
    super(label, collapsibleState);
    const iconFile =
      {
        rootNode: "boolean.svg",
        folderNode: "folder.svg",
      }[contextType] ?? "infor-ln-logo.svg";

    this.iconPath = path.join(
      __filename,
      "..",
      "..",
      "resources",
      "dark",
      iconFile
    );
    this.contextValue = children.length > 0 ? "folderNode" : "leafNode";
  }
}

export class ComponentDataProvider
  implements vscode.TreeDataProvider<TreeNode>
{
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

export async function refreshComponentView(
  dataProvider: ComponentDataProvider
) {
  const result = await axios.get("http://localhost:3000/components");
  const data = result.data;

  const grouped: Record<string, Record<string, Record<string, any[]>>> = {};

  for (const item of data) {
    const type = item.type;
    const pkg = item.package;
    const mod = item.module;

    if (!grouped[type]) grouped[type] = {};
    if (!grouped[type][pkg]) grouped[type][pkg] = {};
    if (!grouped[type][pkg][mod]) grouped[type][pkg][mod] = [];

    grouped[type][pkg][mod].push(item);
  }

  const tree = Object.entries(grouped).map(
    ([type, packages]) =>
      new TreeNode(
        type,
        "rootNode",
        vscode.TreeItemCollapsibleState.Collapsed,
        Object.entries(packages).map(
          ([pkg, modules]) =>
            new TreeNode(
              pkg,
              "folderNode",
              vscode.TreeItemCollapsibleState.Collapsed,
              Object.entries(modules).map(
                ([mod, items]) =>
                  new TreeNode(
                    mod,
                    "folderNode",
                    vscode.TreeItemCollapsibleState.Collapsed,
                    items.map(
                      (item) =>
                        new TreeNode(
                          `${item.package}${item.module}${item.code}`,
                          "leafNode",
                          vscode.TreeItemCollapsibleState.None
                        )
                    )
                  )
              )
            )
        )
      )
  );

  dataProvider.refresh(tree);
}
