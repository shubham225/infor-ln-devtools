import * as vscode from "vscode";
import { fetchComponents, fetchModules } from "../../services/erp-service";
import type { Component } from "../../types/api";

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
          vscode.extensions.getExtension("shubham-shinde.ee-erp-devtools")!
            .extensionUri,
          "resources",
          "infor-ln-logo.svg",
        ),
        dark: vscode.Uri.joinPath(
          vscode.extensions.getExtension("shubham-shinde.ee-erp-devtools")!
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

export class ComponentDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private context: vscode.ExtensionContext;
  private currentServerUrl: string = "";
  private currentVrc: string = "";
  private currentUsername: string = "";
  private currentPassword: string = "";

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
  private originalData: TreeNode[] = []; // Keep original tree for searching
  private selectedComponents: Set<TreeNode> = new Set();
  private selectionChangeListeners: (() => void)[] = [];

  /**
   * Set the current server URL and VRC from the active project
   */
  setActiveProjectSettings(
    serverUrl: string,
    vrc: string,
    username: string,
    password: string,
  ) {
    this.currentServerUrl = serverUrl;
    this.currentVrc = vrc;
    this.currentUsername = username;
    this.currentPassword = password;
    this.currentUsername = username;
    this.currentPassword = password;
  }

  refresh(data: TreeNode[], updateOriginal: boolean = true) {
    this.data = data;
    if (updateOriginal) {
      this.originalData = data; // Always keep a copy of the original tree
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(item: TreeNode): vscode.TreeItem {
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
      const pkg = element.parent?.label || "";
      const mod = element.label;

      if (!this.currentServerUrl) {
        vscode.window.showErrorMessage(
          "No active project. Please select a project first.",
        );
        return Promise.resolve([]);
      }

      return (async () => {
        try {
          const data = await fetchComponents(
            this.currentServerUrl,
            this.currentVrc,
            { type, package: pkg, module: mod },
            { username: this.currentUsername, password: this.currentPassword },
          );

          element.children = data.components.map(
            (comp) =>
              new TreeNode(
                `${data.package}${data.module}${comp.code}`,
                `${comp.desc}`,
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
                },
              ),
          );

          return element.children;
        } catch (err) {
          vscode.window.showErrorMessage(
            `Component loading failed — Reason: ${
              err instanceof Error ? err.message : "Unknown error"
            }`,
          );
          return [];
        }
      })();
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

  clearData() {
    this.data = [];
    this.originalData = [];
    this._onDidChangeTreeData.fire();
  }

  /**
   * Fetch components for a module (used by getChildren and search). Supports
   * optional abort signal so long-running searches can be cancelled.
   */
  private async fetchModuleChildren(
    element: TreeNode,
    options?: { signal?: AbortSignal },
  ): Promise<TreeNode[]> {
    if (element.children && element.children.length > 0) {
      return element.children;
    }

    const type = element.parent?.parent?.label || "UNKNOWN";
    const pkg = element.parent?.label || "";
    const mod = element.label;

    if (!this.currentServerUrl) {
      vscode.window.showErrorMessage(
        "No active project. Please select a project first.",
      );
      return [];
    }

    try {
      const data = await fetchComponents(
        this.currentServerUrl,
        this.currentVrc,
        { type, package: pkg, module: mod },
        { username: this.currentUsername, password: this.currentPassword },
        options?.signal,
      );

      element.children = data.components.map(
        (comp) =>
          new TreeNode(
            `${data.package}${data.module}${comp.code}`,
            comp.desc,
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
            },
          ),
      );

      return element.children;
    } catch (err: any) {
      // If request was aborted, just return empty so search can continue/stop.
      if (err?.name === "CanceledError" || err?.name === "AbortError") {
        return [];
      }

      vscode.window.showErrorMessage(
        `Component loading failed — Reason: ${err.message}`,
      );
      return [];
    }
  }

  /**
   * Search components across the tree with concurrency, progress and cancellation.
   * @param term - The search term
   * @param serverUrl - The server URL
   * @param componentTypeFilter - Optional filter for component type (All, Table, Session, Script)
   */
  async searchAndRefresh(
    term: string,
    serverUrl: string,
    componentTypeFilter: string = "All",
  ) {
    const termLower = term.toLowerCase();
    const resultsByType: Record<string, TreeNode[]> = {};

    // Collect all module nodes to process - use originalData to always search against full tree
    let modNodes: Array<{
      typeNode: TreeNode;
      pkgNode: TreeNode;
      modNode: TreeNode;
    }> = [];

    for (const typeNode of this.originalData) {
      // Filter by component type if specified
      if (
        componentTypeFilter !== "All" &&
        typeNode.label !== componentTypeFilter
      ) {
        continue;
      }

      for (const pkgNode of typeNode.children) {
        for (const modNode of pkgNode.children) {
          modNodes.push({ typeNode, pkgNode, modNode });
        }
      }
    }

    // If the user typed a long identifier (>=5 chars), assume the first 5
    // characters indicate the package/module prefix and limit scanning to
    // matching package/module combos. If that yields no matches, fall back
    // to scanning everything since the search term might be a component code.
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

      modNodes = filtered;
    } else {
      // If user somehow bypassed validation and term is <5 chars, avoid scanning
      // everything. Return empty results instead.
      this.refresh([], false);
      return;
    }

    if (modNodes.length === 0) {
      this.refresh([], false);
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
            if (token.isCancellationRequested) {
              break;
            }
            const i = idx++;
            if (i >= total) {
              break;
            }

            const { typeNode, pkgNode, modNode } = modNodes[i];
            const controller = new AbortController();
            controllers.push(controller);

            try {
              const children = await this.fetchModuleChildren(modNode, {
                signal: controller.signal,
              });

              for (const comp of children) {
                const hay =
                  `${comp.label} ${comp.component?.code} ${pkgNode.label} ${modNode.label}`.toLowerCase();
                if (hay.includes(termLower)) {
                  const resultNode = new TreeNode(
                    comp.label,
                    "",
                    comp.componentType,
                    "componentNode",
                    vscode.TreeItemCollapsibleState.None,
                    [],
                    undefined,
                    comp.component,
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
        for (let w = 0; w < concurrency; w++) {
          workers.push(worker());
        }
        await Promise.all(workers);
      },
    );

    const tree = Object.entries(resultsByType).map(
      ([type, nodes]) =>
        new TreeNode(
          type,
          `(${nodes.length})`,
          type,
          "rootNode",
          vscode.TreeItemCollapsibleState.Collapsed,
          nodes,
          undefined,
        ),
    );

    this.refresh(tree, false);
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
  baseVrc: string = "",
  username: string = "",
  password: string = "",
) {
  try {
    const data = await fetchModules(serverUrl, baseVrc, { username, password });

    const tree = Object.entries(data).map(([type, pkgEntries]) => {
      const typeNode = new TreeNode(
        type,
        "",
        type,
        "rootNode",
        vscode.TreeItemCollapsibleState.Collapsed,
        [],
      );

      typeNode.children = (
        pkgEntries as Array<{
          package: string;
          module: string[];
        }>
      ).map((pkgEntry) => {
        const pkgNode = new TreeNode(
          pkgEntry.package,
          "",
          type,
          "packageNode",
          vscode.TreeItemCollapsibleState.Collapsed,
          [],
          typeNode,
        );

        // Note change: pkgEntry.module instead of pkgEntry.modules
        pkgNode.children = pkgEntry.module.map(
          (mod: string) =>
            new TreeNode(
              mod,
              "",
              type,
              "moduleNode",
              vscode.TreeItemCollapsibleState.Collapsed,
              [],
              pkgNode,
            ),
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
      `Package tree load failed — Reason: ${reason}`,
    );

    dataProvider.refresh([]); // clear tree on failure
  }
}

export class SelectedComponentsDataProvider implements vscode.TreeDataProvider<TreeNode> {
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
          undefined,
        );
      });

      return Promise.resolve(tree);
    } else {
      // Return children for folder nodes (types)
      return Promise.resolve(element.children);
    }
  }
}
