import * as vscode from "vscode";
import axios from "axios";

export interface Component {
  type: string;
  package: string;
  module: string;
  code: string;
}

export class TreeNode extends vscode.TreeItem {
  public readonly component?: Component;

  constructor(
    public readonly label: string,
    public readonly componentType: string = "",
    public readonly description: string = "",
    public readonly contextType: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children: TreeNode[] = [],
    component?: Component
  ) {
    super(label, collapsibleState);
    this.component = component;
    const iconId =
      {
        rootNode:
          componentType === "Table"
            ? "table"
            : componentType === "Session"
            ? "window"
            : "code",
        folderNode: "folder",
      }[contextType] ?? "file-code";

    this.contextValue = children.length > 0 ? "folderNode" : "leafNode";
    this.iconPath = new vscode.ThemeIcon(iconId);
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
  private selectedComponents: Set<TreeNode> = new Set();
  private selectionChangeListeners: (() => void)[] = [];

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

  toggleSelection(node: TreeNode) {
    if (node.component && node.contextType === "leafNode") {
      if (this.selectedComponents.has(node)) {
        this.selectedComponents.delete(node);
      } else {
        this.selectedComponents.add(node);
      }
      this._onDidChangeTreeData.fire();
      this.notifySelectionChange();
    }
  }

  isSelected(node: TreeNode): boolean {
    return this.selectedComponents.has(node);
  }

  getSelectedComponents(): Component[] {
    const components: Component[] = [];
    this.selectedComponents.forEach((node) => {
      if (node.component) {
        components.push(node.component);
      }
    });
    return components;
  }

  getSelectedNodes(): TreeNode[] {
    return Array.from(this.selectedComponents);
  }

  removeSelectedNode(node: TreeNode) {
    // Find and remove the node by component data (in case node references differ after refresh)
    if (node.component) {
      for (const selectedNode of this.selectedComponents) {
        if (
          selectedNode.component &&
          selectedNode.component.type === node.component.type &&
          selectedNode.component.package === node.component.package &&
          selectedNode.component.module === node.component.module &&
          selectedNode.component.code === node.component.code
        ) {
          this.selectedComponents.delete(selectedNode);
          this._onDidChangeTreeData.fire();
          this.notifySelectionChange();
          return true;
        }
      }
    }
    // Fallback to direct reference check
    if (this.selectedComponents.has(node)) {
      this.selectedComponents.delete(node);
      this._onDidChangeTreeData.fire();
      this.notifySelectionChange();
      return true;
    }
    return false;
  }

  clearAll() {
    this.selectedComponents.clear();
    this._onDidChangeTreeData.fire();
    this.notifySelectionChange();
  }

  onSelectionChange(listener: () => void) {
    this.selectionChangeListeners.push(listener);
  }

  private notifySelectionChange() {
    this.selectionChangeListeners.forEach((listener) => listener());
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

    if (!grouped[type]) {
      grouped[type] = {};
    }
    if (!grouped[type][pkg]) {
      grouped[type][pkg] = {};
    }
    if (!grouped[type][pkg][mod]) {
      grouped[type][pkg][mod] = [];
    }

    grouped[type][pkg][mod].push(item);
  }

  const tree = Object.entries(grouped).map(
    ([type, packages]) =>
      new TreeNode(
        type,
        type,
        "",
        "rootNode",
        vscode.TreeItemCollapsibleState.Collapsed,
        Object.entries(packages).map(
          ([pkg, modules]) =>
            new TreeNode(
              pkg,
              type,
              "",
              "folderNode",
              vscode.TreeItemCollapsibleState.Collapsed,
              Object.entries(modules).map(
                ([mod, items]) =>
                  new TreeNode(
                    mod,
                    type,
                    "",
                    "folderNode",
                    vscode.TreeItemCollapsibleState.Collapsed,
                    items.map(
                      (item) =>
                        new TreeNode(
                          `${item.package}${item.module}${item.code}`,
                          type,
                          "",
                          "leafNode",
                          vscode.TreeItemCollapsibleState.None,
                          [],
                          {
                            type: item.type,
                            package: item.package,
                            module: item.module,
                            code: item.code,
                          }
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

export class SelectedComponentsDataProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    TreeNode | undefined | null | void
  > = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    TreeNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private componentProvider: ComponentDataProvider) {
    // Listen to selection changes in the main component provider
    componentProvider.onSelectionChange(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    if (!element) {
      // Root level: group by component type
      const selectedNodes = this.componentProvider.getSelectedNodes();
      const groupedByType: Record<string, TreeNode[]> = {};

      selectedNodes.forEach((node) => {
        if (node.component) {
          const type = node.component.type;
          if (!groupedByType[type]) {
            groupedByType[type] = [];
          }
          groupedByType[type].push(node);
        }
      });

      const tree = Object.entries(groupedByType).map(([type, nodes]) => {
        return new TreeNode(
          type,
          type,
          `(${nodes.length})`,
          "rootNode",
          vscode.TreeItemCollapsibleState.Collapsed,
          nodes,
          undefined
        );
      });

      return Promise.resolve(tree);
    } else {
      // Return children for folder nodes (types)
      return Promise.resolve(element.children);
    }
  }
}
