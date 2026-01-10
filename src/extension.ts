import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import axios from "axios";
import AdmZip from "adm-zip";
import { ComponentDataProvider, refreshComponentView, TreeNode, SelectedComponentsDataProvider } from "./component-data-provider";

export function activate(context: vscode.ExtensionContext) {
  const componentExplorerProvider = new ComponentDataProvider();
  const selectedComponentsProvider = new SelectedComponentsDataProvider(componentExplorerProvider);

  vscode.window.registerTreeDataProvider("component-explorer", componentExplorerProvider);
  vscode.window.registerTreeDataProvider("selected-components", selectedComponentsProvider);
  
  vscode.commands.registerCommand("component-explorer.refresh", async () => await refreshComponentView(componentExplorerProvider));
  
  vscode.commands.registerCommand("component-explorer.select", async (node?: TreeNode) => {
    if (node && node.contextType === "leafNode") {
      componentExplorerProvider.toggleSelection(node);
      const isSelected = componentExplorerProvider.isSelected(node);
      vscode.window.showInformationMessage(
        `${isSelected ? "Selected" : "Deselected"} ${node.label}`
      );
      // selectedComponentsProvider will automatically refresh via listener
    } else {
      // If called on a folder/root or without node, import all selected components
      await importComponents(componentExplorerProvider);
    }
  });

  // Import command for selected components view
  vscode.commands.registerCommand("selected-components.import", async () => {
    await importComponents(componentExplorerProvider);
  });

  // Remove command for selected components view
  vscode.commands.registerCommand("selected-components.remove", async (node?: TreeNode) => {
    if (node && node.component) {
      const removed = componentExplorerProvider.removeSelectedNode(node);
      if (removed) {
        vscode.window.showInformationMessage(`Removed ${node.label} from selection`);
        // selectedComponentsProvider will automatically refresh via listener
      }
    }
  });

  // Add a command to trigger import of all selected components
  vscode.commands.registerCommand("component-explorer.importSelected", async () => {
    await importComponents(componentExplorerProvider);
  });
}

async function importComponents(selectedProvider: ComponentDataProvider) {
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

  const developmentFolder = path.join(workspaceFolder.uri.fsPath, "Development");
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
        "http://localhost:3000/import",
        { components },
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
      const errorMessage =
        error.response?.data
          ? Buffer.from(error.response.data).toString("utf-8")
          : error.message;
      vscode.window.showErrorMessage(
        `Failed to import components: ${errorMessage}`
      );
    }
  });
}

export function deactivate() {}
