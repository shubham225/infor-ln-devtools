import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import axios from "axios";
import AdmZip from "adm-zip";
import {
  ComponentDataProvider,
  refreshComponentView,
  TreeNode,
  SelectedComponentsDataProvider,
} from "./component-data-provider";

const REMOTE_HOST = "http://localhost:3000";
const IMPORT_PATH = "/api/import";
const FETCH_VRCS_PATH = "/api/vrc";

export async function activate(context: vscode.ExtensionContext) {
  let vrc = context.globalState.get<string>("vrc") || "";
  let projectCode = context.globalState.get<string>("projectCode") || "";
  let serverUrl = context.globalState.get<string>("serverUrl") ?? REMOTE_HOST;

  async function askServerUrl() {
    const input = await vscode.window.showInputBox({
      title: "Enter Backend API URL",
      prompt:
        "Example: http://192.168.1.50:3000 or https://api.my-server.com:6443",
      value: serverUrl,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim() === "") {
          return "Backend API URL is required";
        }
        return null;
      },
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
    // Fetch VRCs from server
    let vrcList: string[] = [];
    try {
      const response = await axios.post(`${serverUrl}${FETCH_VRCS_PATH}`, {});
      if (response.data && Array.isArray(response.data)) {
        vrcList = response.data;
      }
    } catch (err) {
      console.warn("Failed to fetch VRCs from server, allowing free input");
    }

    // If VRCs list is available, show quick pick; otherwise show input box
    if (vrcList.length > 0) {
      const selected = await vscode.window.showQuickPick(vrcList, {
        title: "Select Base VRC",
        placeHolder: "Choose from available VRCs",
        ignoreFocusOut: true,
      });
      vrc = selected || vrc;
    } else {
      vrc =
        (await vscode.window.showInputBox({
          title: "Enter Base VRC",
          prompt: "Example: E50C_1_E501",
          ignoreFocusOut: true,
          value: vrc,
          validateInput: (value) => {
            if (!value || value.trim() === "") {
              return "Base VRC is required";
            }
            return null;
          },
        })) || vrc;
    }

    projectCode =
      (await vscode.window.showInputBox({
        title: "Enter Project Folder Name",
        prompt: "Example: 123456",
        ignoreFocusOut: true,
        value: projectCode,
        validateInput: (value) => {
          if (!value || value.trim() === "") {
            return "Project Folder Name is required";
          }
          return null;
        },
      })) || projectCode;

    if (vrc) {await context.globalState.update("vrc", vrc)};
    if (projectCode) {await context.globalState.update("projectCode", projectCode)};

    vscode.window.showInformationMessage(
      `Settings saved: Project=${projectCode} Base VRC=${vrc}`
    );
  }

  // ensure settings exist before loading views
  if (!vrc || !projectCode) {
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
  componentExplorerView.title = `Components [${vrc} | ${projectCode}]`;
  await refreshComponentView(componentExplorerProvider, serverUrl, vrc);

  vscode.commands.registerCommand(
    "component-explorer.refresh",
    async () => await refreshComponentView(componentExplorerProvider, serverUrl, vrc)
  );

  vscode.commands.registerCommand("component-explorer.configure", async () => {
    await loadSettings();
    componentExplorerView.title = `Components [${vrc} | ${projectCode}]`;
    await refreshComponentView(componentExplorerProvider, serverUrl, vrc);
  });

  vscode.commands.registerCommand("component-explorer.updateUrl", async () => {
    await askServerUrl();
    await refreshComponentView(componentExplorerProvider, serverUrl, vrc);
  });

  // Search components (lazy-load modules as needed)
  vscode.commands.registerCommand("component-explorer.search", async () => {
    const term = await vscode.window.showInputBox({
      title: "Search Components",
      prompt:
        "Enter search term (partial names are fine). Leave empty to clear search.",
      ignoreFocusOut: true,
    });

    if (term === undefined) {
      return; // user cancelled
    }

    const cleaned = term.trim();
    if (cleaned === "") {
      // clear search
      componentExplorerView.title = `Components [${vrc} | ${projectCode}]`;
      await refreshComponentView(componentExplorerProvider, serverUrl);
      return;
    }

    if (cleaned.length < 5) {
      vscode.window.showInformationMessage(
        "Please enter at least 5 characters to perform a search."
      );
      return;
    }

    componentExplorerView.title = `Components [${vrc} | ${projectCode}] - Search: ${cleaned}`;
    await componentExplorerProvider.searchAndRefresh(cleaned, serverUrl);
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
        await importComponents(
          componentExplorerProvider,
          serverUrl,
          vrc,
          projectCode
        );
      }
    }
  );

  // Import command for selected components view
  vscode.commands.registerCommand("selected-components.import", async () => {
    await importComponents(
      componentExplorerProvider,
      serverUrl,
      vrc,
      projectCode
    );
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
      await importComponents(
        componentExplorerProvider,
        serverUrl,
        vrc,
        projectCode
      );
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

      // Send POST request to ERP downloadComponents endpoint
      const response = await axios.post(
        `${serverUrl}${IMPORT_PATH}`,
        { baseVRC: vrc, importFolder, components, username: os.userInfo().username },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const respData = response.data;
      if (!respData || !respData.data) {
        throw new Error("Invalid response from server");
      }

      progress.report({
        increment: 50,
        message: "Received zip data, extracting...",
      });

      // Extract zip file from base64 payload
      const zipBuffer = Buffer.from(respData.data, "base64");
      const zip = new AdmZip(zipBuffer);

      // 1. extract to temp
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ln-import-"));
      zip.extractAllTo(tempDir, true);

      // 2. collect conflicts (except manifest.csv)
      const targetRoot = developmentFolder;
      let newFiles: string[] = [];

      zip.getEntries().forEach((entry) => {
        const rel = entry.entryName;
        const dest = path.join(targetRoot, rel);
        newFiles.push(rel);
      });

      const nonManifestConflicts = newFiles.filter((rel) => {
        const dest = path.join(targetRoot, rel);
        if (rel.toLowerCase() === "script/manifest.csv") {
          return false;
        }
        if (!fs.existsSync(dest)) {
          return false;
        } // no conflict if doesn't exist

        const stats = fs.statSync(dest);
        return stats.isFile(); // only count files as conflicts
      });

      // 3. prompt user if collisions found
      if (nonManifestConflicts.length > 0) {
        const confirm = await vscode.window.showWarningMessage(
          "This will replace existing component(s). Continue?",
          "Yes",
          "No"
        );
        if (confirm !== "Yes") {
          return; // cancel import
        }
      }

      // 4. process manifest merging logic
      const newManifest = path.join(tempDir, "Script", "manifest.csv");
      const oldManifest = path.join(targetRoot, "Script", "manifest.csv");

      if (fs.existsSync(newManifest)) {
        fs.mkdirSync(path.dirname(oldManifest), { recursive: true });

        if (fs.existsSync(oldManifest)) {
          const oldData = fs.readFileSync(oldManifest, "utf-8").trim();
          const newData = fs.readFileSync(newManifest, "utf-8").trim();

          const newLines = newData.split(/\r?\n/);
          const merged = oldData + "\n" + newLines.slice(1).join("\n");

          fs.writeFileSync(oldManifest, merged, "utf-8");
        } else {
          // no old manifest — copy as-is
          fs.copyFileSync(newManifest, oldManifest);
        }

        // remove manifest from normal copy
        newFiles = newFiles.filter(
          (f) => f.toLowerCase() !== "script/manifest.csv"
        );
      }

      // 5. move remaining files (overwrite allowed)
      for (const rel of newFiles) {
        const src = path.join(tempDir, rel);
        const dest = path.join(targetRoot, rel);

        const stats = fs.statSync(src);

        if (stats.isDirectory()) {
          // create empty directory if it doesn't exist
          fs.mkdirSync(dest, { recursive: true });
        } else {
          // ensure parent directory exists
          fs.mkdirSync(path.dirname(dest), { recursive: true });

          // copy file
          fs.copyFileSync(src, dest);
        }
      }

      // 6. cleanup temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });

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
