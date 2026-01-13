import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import axios from "axios";
import AdmZip from "adm-zip";
import {
  ComponentDataProvider,
  refreshComponentView,
  TreeNode,
  SelectedComponentsDataProvider,
} from "./component-data-provider";

export async function activate(context: vscode.ExtensionContext) {
  let vrc = context.globalState.get<string>("vrc") || "";
  let pmcName = context.globalState.get<string>("pmcName") || "";
  let serverUrl = context.globalState.get<string>("serverUrl") ?? "http://localhost:3000";

  async function askServerUrl() {
    const input = await vscode.window.showInputBox({
      title: "Enter Server URL",
      prompt: "Example: http://192.168.1.50:3000 or https://my-server.com/api",
      value: serverUrl,
      ignoreFocusOut: true,
    });

    if (input) {
      serverUrl = input.trim();
      await context.globalState.update("serverUrl", serverUrl);
      vscode.window.showInformationMessage(`Server URL set to ${serverUrl}`);
    }
  }

  if (!serverUrl) {
    await askServerUrl();
  }

  async function loadSettings() {
    vrc =
      (await vscode.window.showInputBox({
        title: "Enter Package Combination",
        prompt: "Example: E50C_1_E501",
        ignoreFocusOut: true,
        value: vrc,
      })) || "";

    pmcName =
      (await vscode.window.showInputBox({
        title: "Enter Import Issue Name",
        prompt: "Example: EDM-1111",
        ignoreFocusOut: true,
        value: pmcName,
      })) || "";

    // Persist values for next session
    await context.globalState.update("vrc", vrc);
    await context.globalState.update("pmcName", pmcName);

    vscode.window.showInformationMessage(
      `Settings saved: PMC=${pmcName} Combo=${vrc}`
    );
  }

  // ensure settings exist before loading views
  if (!vrc || !pmcName) {
    await loadSettings();
  }

  const componentExplorerProvider = new ComponentDataProvider(context);
  const selectedComponentsProvider = new SelectedComponentsDataProvider(
    componentExplorerProvider
  );

  vscode.window.registerTreeDataProvider(
    "component-explorer",
    componentExplorerProvider
  );
  vscode.window.registerTreeDataProvider(
    "selected-components",
    selectedComponentsProvider
  );

  const componentExplorerView = vscode.window.createTreeView(
    "component-explorer",
    {
      treeDataProvider: componentExplorerProvider,
    }
  );

  // Set initial title
  componentExplorerView.title = `Components [${vrc} — ${pmcName}]`;
  await refreshComponentView(componentExplorerProvider, serverUrl);

  vscode.commands.registerCommand(
    "component-explorer.refresh",
    async () => await refreshComponentView(componentExplorerProvider, serverUrl)
  );

  vscode.commands.registerCommand("component-explorer.configure", async () => {
    await loadSettings();
    componentExplorerView.title = `Components [${vrc} — ${pmcName}]`;
    await refreshComponentView(componentExplorerProvider, serverUrl);
  });

  vscode.commands.registerCommand("component-explorer.updateUrl", async () => {
    await askServerUrl();
    await refreshComponentView(componentExplorerProvider, serverUrl);
  });

  vscode.commands.registerCommand(
    "component-explorer.select",
    async (node?: TreeNode) => {
      if (node && node.contextType === "componentNode") {
        componentExplorerProvider.toggleSelection(node);
        const isSelected = componentExplorerProvider.isSelected(node);
        // selectedComponentsProvider will automatically refresh via listener
      } else {
        // If called on a folder/root or without node, import all selected components
        await importComponents(componentExplorerProvider, serverUrl, vrc, pmcName);
      }
    }
  );

  // Import command for selected components view
  vscode.commands.registerCommand("selected-components.import", async () => {
    await importComponents(componentExplorerProvider, serverUrl, vrc, pmcName);
  });

  // Remove command for selected components view
  vscode.commands.registerCommand(
    "selected-components.remove",
    async (node?: TreeNode) => {
      if (node && node.component) {
        const removed = componentExplorerProvider.removeSelectedNode(node);
      }
    }
  );

  // Add a command to trigger import of all selected components
  vscode.commands.registerCommand(
    "component-explorer.importSelected",
    async () => {
      await importComponents(componentExplorerProvider, serverUrl, vrc, pmcName);
    }
  );
}

async function importComponents(
  selectedProvider: ComponentDataProvider,
  serverUrl: string,
  vrc: string,
  importFolder: string
) {
  const components = selectedProvider.getSelectedComponents();

  if (components.length === 0) {
    vscode.window.showWarningMessage("No components selected for import.");
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found.");
    return;
  }

  const developmentFolder = path.join(
    workspaceFolder.uri.fsPath,
    "Development",
    importFolder
  );
  if (!fs.existsSync(developmentFolder)) {
    fs.mkdirSync(developmentFolder, { recursive: true });
  }

  const progressOptions: vscode.ProgressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: "Importing Components",
    cancellable: false,
  };

  await vscode.window.withProgress(progressOptions, async (progress) => {
    try {
      progress.report({
        increment: 0,
        message: `Sending ${components.length} component(s) to server...`,
      });

      // Send POST request to /import endpoint
      const response = await axios.post(
        `${serverUrl}/import`,
        { vrc, importFolder, components },
        {
          responseType: "arraybuffer",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      progress.report({
        increment: 50,
        message: "Received zip file, extracting...",
      });

      // Extract zip file
      const zip = new AdmZip(Buffer.from(response.data));
      zip.extractAllTo(developmentFolder, true);

      progress.report({
        increment: 100,
        message: "Extraction complete!",
      });

      // Clear selected components after successful import
      selectedProvider.clearAll();

      vscode.window.showInformationMessage(
        `Successfully imported ${components.length} component(s) to Development folder`
      );
    } catch (error: any) {
      console.error("Error importing components:", error);
      const errorMessage = error.response?.data
        ? Buffer.from(error.response.data).toString("utf-8")
        : error.message;
      vscode.window.showErrorMessage(
        `Failed to import components: ${errorMessage}`
      );
    }
  });
}

export function deactivate() {}
