import * as vscode from "vscode";
import axios from "axios";
import { getServerUrl } from "./utils";

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
    public readonly description: string = "",
    public readonly componentType: string = "",
    public readonly contextType: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public children: TreeNode[] = [],
    public readonly parent?: TreeNode,
    component?: Component
  ) {
    super(label, collapsibleState);
    this.component = component;
    const iconId = {
      rootNode:
        componentType === "Table"
          ? "table"
          : componentType === "Session"
          ? "window"
          : "code",
      packageNode: "folder",
      moduleNode: "folder",
    }[contextType];

    if (iconId) {
      this.iconPath = new vscode.ThemeIcon(iconId);
    } else {
      // Fallback to custom SVG
      this.iconPath = {
        light: vscode.Uri.joinPath(
          vscode.extensions.getExtension("shubham-shinde.infor-ln-devtools")!
            .extensionUri,
          "resources",
          "infor-ln-logo.svg"
        ),
        dark: vscode.Uri.joinPath(
          vscode.extensions.getExtension("shubham-shinde.infor-ln-devtools")!
            .extensionUri,
          "resources",
          "infor-ln-logo.svg"
        ),
      };
    }
    this.contextValue = contextType;
  }
}

export class ComponentDataProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

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
    if (!element) {
      return Promise.resolve(this.data);
    }

    if (element.contextType === "rootNode") {
      return Promise.resolve(element.children);
    }

    if (element.contextType === "packageNode") {
      return Promise.resolve(element.children);
    }

    // Module → lazy load components
    if (element.contextType === "moduleNode") {
      // If cached, don't fetch again
      if (element.children && element.children.length > 0) {
        return Promise.resolve(element.children);
      }

      const type = element.parent?.parent?.label || "UNKNOWN";
      const pkg = element.parent?.label;
      const mod = element.label;

      const serverUrl = this.context.globalState.get<string>("serverUrl");
      if (!serverUrl) {
        vscode.window.showErrorMessage("Server URL is not configured.");
        return Promise.resolve([]);
      }

      return axios
        .post(`${serverUrl}/components`, {
          type,
          package: pkg,
          module: mod,
        })
        .then((res) => {
          const data = res.data as {
            type: string;
            package: string;
            module: string;
            code: string[];
          };

          element.children = data.code.map(
            (codeStr) =>
              new TreeNode(
                `${data.package}${data.module}${codeStr}`,
                "",
                data.type,
                "componentNode",
                vscode.TreeItemCollapsibleState.None,
                [],
                element,
                {
                  type: data.type,
                  package: data.package,
                  module: data.module,
                  code: codeStr,
                }
              )
          );

          return element.children;
        })
        .catch((err) => {
          vscode.window.showErrorMessage(
            "Failed to load components: " + err.message
          );
          return [];
        });
    }

    // Components have no children
    return Promise.resolve([]);
  }

  toggleSelection(node: TreeNode) {
    if (node.component && node.contextType === "componentNode") {
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
  dataProvider: ComponentDataProvider,
  serverUrl: string
) {
  try {
    const result = await axios.get(`${serverUrl}/modules`);

    type ModulesResponse = {
      [type: string]: Array<{
        package: string;
        module: string[];
      }>;
    };

    const data = result.data as ModulesResponse;

    const tree = Object.entries(data).map(([type, pkgEntries]) => {
      const typeNode = new TreeNode(
        type,
        "",
        type,
        "rootNode",
        vscode.TreeItemCollapsibleState.Collapsed,
        []
      );

      typeNode.children = pkgEntries.map((pkgEntry) => {
        const pkgNode = new TreeNode(
          pkgEntry.package,
          "",
          type,
          "packageNode",
          vscode.TreeItemCollapsibleState.Collapsed,
          [],
          typeNode
        );

        // Note change: pkgEntry.module instead of pkgEntry.modules
        pkgNode.children = pkgEntry.module.map(
          (mod) =>
            new TreeNode(
              mod,
              "",
              type,
              "moduleNode",
              vscode.TreeItemCollapsibleState.Collapsed,
              [],
              pkgNode
            )
        );

        return pkgNode;
      });

      return typeNode;
    });

    dataProvider.refresh(tree);

  } catch (err: any) {
    console.error(err);

    let reason = err.message || "Unknown error";

    if (err.response) {
      reason = `${err.response.status}: ${err.response.statusText}`;
    } else if (err.code === "ECONNREFUSED") {
      reason = "Server not reachable";
    }

    vscode.window.showErrorMessage(
      `Failed to load modules from server: ${reason}`
    );

    dataProvider.refresh([]); // clear tree on failure
  }
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
          `(${nodes.length})`,
          type,
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
