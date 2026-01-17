import * as vscode from "vscode";
import axios from "axios";

const MODULES_PATH = "/api/module";
const COMPONENTS_PATH = "/api/component";

export interface Component {
  type: string;
  package: string;
  module: string;
  code: string;
}

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
    this.filterText = `${label} ${description}`.toLowerCase();
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

  getTreeItem(item: TreeNode): vscode.TreeItem  {
  item.filterText = `${item.label} ${item.description}`.toLowerCase();
  return item;
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

      const baseVrc = this.context.globalState.get<string>("vrc") || "";

      type Component = {
        code: string; description: string
      }

      return axios
        .post(`${serverUrl}${COMPONENTS_PATH}`, {
          type,
          package: pkg,
          module: mod,
          baseVrc,
        })
        .then((res) => {
          const data = res.data as {
            type: string;
            package: string;
            module: string;
            component: Component[];
          };    

          element.children = data.component.map(
            (comp) =>
              new TreeNode(
                `${data.package}${data.module}${comp.code}`,
                `(${comp.description})`,
                data.type,
                "componentNode",
                vscode.TreeItemCollapsibleState.None,
                [],
                element,
                {
                  type: data.type,
                  package: data.package,
                  module: data.module,
                  code: comp.code,
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

  /**
   * Fetch components for a module (used by getChildren and search). Supports
   * optional abort signal so long-running searches can be cancelled.
   */
  private async fetchModuleChildren(
    element: TreeNode,
    options?: { signal?: AbortSignal }
  ): Promise<TreeNode[]> {
    if (element.children && element.children.length > 0) {
      return element.children;
    }

    const type = element.parent?.parent?.label || "UNKNOWN";
    const pkg = element.parent?.label;
    const mod = element.label;

    const serverUrl = this.context.globalState.get<string>("serverUrl");
    if (!serverUrl) {
      vscode.window.showErrorMessage("Server URL is not configured.");
      return [];
    }

    try {
      const baseVrc = this.context.globalState.get<string>("vrc") || "";

      const res = await axios.post(
        `${serverUrl}${COMPONENTS_PATH}`,
        { type, package: pkg, module: mod, baseVrc },
        { signal: options?.signal }
      );

      const data = res.data as {
        type: string;
        package: string;
        module: string;
        component: Array<{ code: string; description: string }>;
      };

      element.children = data.component.map(
        (comp) =>
          new TreeNode(
            `${data.package}${data.module}${comp.code}`,
            comp.description,
            data.type,
            "componentNode",
            vscode.TreeItemCollapsibleState.None,
            [],
            element,
            {
              type: data.type,
              package: data.package,
              module: data.module,
              code: comp.code,
            }
          )
      );

      return element.children;
    } catch (err: any) {
      // If request was aborted, just return empty so search can continue/stop.
      if (err?.name === "CanceledError" || err?.name === "AbortError") {
        return [];
      }

      vscode.window.showErrorMessage("Failed to load components: " + err.message);
      return [];
    }
  }

  /**
   * Search components across the tree with concurrency, progress and cancellation.
   */
  async searchAndRefresh(term: string, serverUrl: string) {
    const termLower = term.toLowerCase();
    const resultsByType: Record<string, TreeNode[]> = {};

    // Collect all module nodes to process
    let modNodes: Array<{
      typeNode: TreeNode;
      pkgNode: TreeNode;
      modNode: TreeNode;
    }> = [];

    for (const typeNode of this.data) {
      for (const pkgNode of typeNode.children) {
        for (const modNode of pkgNode.children) {
          modNodes.push({ typeNode, pkgNode, modNode });
        }
      }
    }

    // If the user typed a long identifier (>=5 chars), assume the first 5
    // characters indicate the package/module prefix and limit scanning to
    // matching package/module combos. If that yields no matches, fall back
    // to scanning everything.
    if (termLower.length >= 5) {
      const prefix = termLower.slice(0, 5);
      const filtered = modNodes.filter(({ pkgNode, modNode }) => {
        const pkg = (pkgNode.label || "").toLowerCase();
        const mod = (modNode.label || "").toLowerCase();
        const combined = `${pkg}${mod}`;
        return (
          pkg.includes(prefix) ||
          mod.includes(prefix) ||
          combined.startsWith(prefix) ||
          combined.includes(prefix)
        );
      });

      if (filtered.length > 0) {
        modNodes = filtered;
      } else {
        // No modules match the prefix — do NOT fall back to scanning everything.
        // Return empty results and inform the user.
        this.refresh([]);
        vscode.window.showInformationMessage(
          `No modules match prefix '${prefix}'. Try a different prefix (at least 5 characters).`
        );
        return;
      }
    } else {
      // If user somehow bypassed validation and term is <5 chars, avoid scanning
      // everything. Return empty results instead.
      this.refresh([]);
      return;
    }

    if (modNodes.length === 0) {
      this.refresh([]);
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Searching components for "${term}"`,
        cancellable: true,
      },
      async (progress, token) => {
        const total = modNodes.length;
        let processed = 0;
        const controllers: AbortController[] = [];

        token.onCancellationRequested(() => {
          controllers.forEach((c) => c.abort());
        });

        let idx = 0;
        const concurrency = 8; // reasonable default for parallel module fetches

        const worker = async () => {
          while (true) {
            if (token.isCancellationRequested) { break; }
            const i = idx++;
            if (i >= total) { break; }

            const { typeNode, pkgNode, modNode } = modNodes[i];
            const controller = new AbortController();
            controllers.push(controller);

            try {
              const children = await this.fetchModuleChildren(modNode, {
                signal: controller.signal,
              });

              for (const comp of children) {
                const hay = `${comp.label} ${comp.component?.code} ${pkgNode.label} ${modNode.label}`.toLowerCase();
                if (hay.includes(termLower)) {
                  const resultNode = new TreeNode(
                    comp.label,
                    "",
                    comp.componentType,
                    "componentNode",
                    vscode.TreeItemCollapsibleState.None,
                    [],
                    undefined,
                    comp.component
                  );

                  if (!resultsByType[typeNode.label]) {
                    resultsByType[typeNode.label] = [];
                  }
                  resultsByType[typeNode.label].push(resultNode);
                }
              }
            } catch (err) {
              console.error("Error during module fetch in search:", err);
            } finally {
              processed++;
              progress.report({
                message: `Scanned ${processed}/${total} modules`,
                increment: Math.floor((processed / total) * 100),
              });
            }
          }
        };

        // Start workers and wait for completion or cancellation
        const workers: Promise<void>[] = [];
        for (let w = 0; w < concurrency; w++) { workers.push(worker()); }
        await Promise.all(workers);
      }
    );

    const tree = Object.entries(resultsByType).map(([type, nodes]) =>
      new TreeNode(
        type,
        `(${nodes.length})`,
        type,
        "rootNode",
        vscode.TreeItemCollapsibleState.Collapsed,
        nodes,
        undefined
      )
    );

    this.refresh(tree);
  }

  async clearSearch(serverUrl: string, baseVrc: string = "") {
    await refreshComponentView(this, serverUrl, baseVrc);
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
  serverUrl: string,
  baseVrc: string = ""
) {
  try {
    const result = await axios.post(`${serverUrl}${MODULES_PATH}`, {
      baseVrc
    });

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
