import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import AdmZip from "adm-zip";
import {
  ComponentDataProvider,
  refreshComponentView,
  TreeNode,
  SelectedComponentsDataProvider,
} from "./component-data-provider";
import { showConfigurationForm } from "./config-webview";
import { showImportForm, showImportByPMCForm } from "./import-form-webview";
import { ProjectDataProvider, ProjectNode } from "./project-data-provider";
import { showProjectForm } from "./project-form-webview";
import { makeSoapRequest } from "./soap-client";

export async function activate(context: vscode.ExtensionContext) {
  let vrc = context.globalState.get<string>("vrc") || "";
  let serverUrl = context.globalState.get<string>("serverUrl") || "";
  
  // VRC cache to avoid repeated requests
  let vrcCache: string[] | null = null;

  async function fetchVRCList(pmc?: string): Promise<string[]> {
    // If no PMC and cache exists, return cached data
    if (!pmc && vrcCache !== null) {
      return vrcCache;
    }

    try {
      const requestBody: Record<string, any> = {};
      if (pmc) {
        requestBody.pmc = pmc;
      }

      const data = await makeSoapRequest({
        serverUrl,
        method: "fetchVRCs",
        requestBody,
      });
      if (Array.isArray(data.vrcs)) {
        // Only cache if no PMC was provided (general VRC list)
        if (!pmc) {
          vrcCache = data.vrcs;
        }
        return data.vrcs;
      }
    } catch (err) {
      console.warn("Failed to fetch VRCs from server");
    }
    return [];
  }

  async function showSettingsForm() {
    const vrcList = await fetchVRCList();
    const settings = await showConfigurationForm(
      context,
      { serverUrl, vrc },
      vrcList,
    );

    if (settings) {
      serverUrl = settings.serverUrl;
      vrc = settings.vrc;

      await context.globalState.update("serverUrl", serverUrl);
      await context.globalState.update("vrc", vrc);

      vscode.window.showInformationMessage(
        `Settings saved: Base VRC=${vrc}`,
      );

      return true;
    }
    return false;
  }

  // ensure settings exist before loading views
  if (!vrc || !serverUrl) {
    const setupComplete = await showSettingsForm();
    if (!setupComplete) {
      vscode.window.showErrorMessage(
        "Extension requires configuration to run. Please configure settings.",
      );
      return;
    }
  }

  const projectExplorerProvider = new ProjectDataProvider(context);
  const componentExplorerProvider = new ComponentDataProvider(context);
  const selectedComponentsProvider = new SelectedComponentsDataProvider(
    componentExplorerProvider,
  );

  vscode.window.registerTreeDataProvider(
    "project-explorer",
    projectExplorerProvider,
  );
  vscode.window.registerTreeDataProvider(
    "component-explorer",
    componentExplorerProvider,
  );
  vscode.window.registerTreeDataProvider(
    "selected-components",
    selectedComponentsProvider,
  );

  const componentExplorerView = vscode.window.createTreeView(
    "component-explorer",
    {
      treeDataProvider: componentExplorerProvider,
    },
  );

  // Set initial title
  componentExplorerView.title = `Components [${vrc}]`;
  await refreshComponentView(componentExplorerProvider, serverUrl, vrc);

  // Project Explorer Commands
  vscode.commands.registerCommand("project-explorer.refresh", () => {
    projectExplorerProvider.refresh();
  });

  vscode.commands.registerCommand("project-explorer.addProject", async () => {
    const vrcList = await fetchVRCList();
    const project = await showProjectForm(context, vrcList);
    
    if (project) {
      try {
        // Create project folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found.");
          return;
        }

        const projectFolder = path.join(
          workspaceFolder.uri.fsPath,
          "Development",
          project.name,
        );

        if (fs.existsSync(projectFolder)) {
          const overwrite = await vscode.window.showWarningMessage(
            `Folder "${project.name}" already exists. Link to existing folder?`,
            "Yes",
            "No",
          );
          if (overwrite !== "Yes") {
            return;
          }
        } else {
          fs.mkdirSync(projectFolder, { recursive: true });
        }

        await projectExplorerProvider.addProject(project);
        vscode.window.showInformationMessage(
          `Project "${project.name}" created successfully!`,
        );
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create project: ${err.message}`);
      }
    }
  });

  vscode.commands.registerCommand(
    "project-explorer.editProject",
    async (node?: ProjectNode) => {
      if (!node || !node.project) {
        return;
      }

      const vrcList = await fetchVRCList();
      const updatedProject = await showProjectForm(context, vrcList, node.project);

      if (updatedProject) {
        try {
          await projectExplorerProvider.updateProject(node.project.name, updatedProject);
          vscode.window.showInformationMessage(
            `Project "${updatedProject.name}" updated successfully!`,
          );
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to update project: ${err.message}`);
        }
      }
    },
  );

  vscode.commands.registerCommand(
    "project-explorer.setActive",
    async (node?: ProjectNode) => {
      if (!node || !node.project) {
        return;
      }

      try {
        await projectExplorerProvider.setActiveProject(node.project.name);
        vscode.window.showInformationMessage(
          `Active project set to "${node.project.name}"`,
        );
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to set active project: ${err.message}`);
      }
    },
  );

  vscode.commands.registerCommand(
    "project-explorer.importByPMC",
    async (node?: ProjectNode) => {
      if (!node || !node.project) {
        return;
      }

      const project = node.project;
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found.");
        return;
      }

      const developmentFolder = path.join(
        workspaceFolder.uri.fsPath,
        "Development",
        project.name,
      );
      if (!fs.existsSync(developmentFolder)) {
        fs.mkdirSync(developmentFolder, { recursive: true });
      }

      const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: "Importing Components by PMC",
        cancellable: false,
      };

      await vscode.window.withProgress(progressOptions, async (progress) => {
        try {
          progress.report({
            increment: 0,
            message: `Fetching components for PMC ${project.pmc}...`,
          });

          // Send SOAP request to ERP downloadComponentsByPMC endpoint
          const respData = await makeSoapRequest({
            serverUrl,
            method: "downloadComponentsByPMC",
            requestBody: {
              pmc: project.pmc,
              vrc: project.vrc,
              username: os.userInfo().username,
              role: project.role,
              jiraId: project.jiraId,
            },
          });
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
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ln-import-pmc-"));
          zip.extractAllTo(tempDir, true);

          // 2. collect conflicts (except manifest.csv)
          const targetRoot = developmentFolder;
          let newFiles: string[] = [];

          zip.getEntries().forEach((entry) => {
            const rel = entry.entryName;
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
              "No",
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
              (f) => f.toLowerCase() !== "script/manifest.csv",
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

          vscode.window.showInformationMessage(
            `Successfully imported components (PMC: ${project.pmc}) to project "${project.name}"`,
          );
        } catch (error: any) {
          console.error("Error importing components by PMC:", error);
          const errorMessage = error.response?.data
            ? Buffer.from(error.response.data).toString("utf-8")
            : error.message;
          vscode.window.showErrorMessage(
            `Download by PMC Failed —  Reason: ${errorMessage}`,
          );
        }
      });
    },
  );

  vscode.commands.registerCommand(
    "project-explorer.closeProject",
    async (node?: ProjectNode) => {
      if (!node || !node.project) {
        return;
      }

      const project = node.project;
      const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to close project "${project.name}"? This will send a close request to ERP and delete the project folder.`,
        { modal: true },
        "Yes, Close Project",
        "Cancel",
      );

      if (confirmation !== "Yes, Close Project") {
        return;
      }

      const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: `Closing Project "${project.name}"`,
        cancellable: false,
      };

      await vscode.window.withProgress(progressOptions, async (progress) => {
        try {
          progress.report({
            increment: 0,
            message: "Sending close request to ERP...",
          });

          // Send SOAP request to ERP closeProject endpoint
          const respData = await makeSoapRequest({
            serverUrl,
            method: "closeProject",
            requestBody: {
              pmc: project.pmc,
              vrc: project.vrc,
              username: os.userInfo().username,
            },
          });

          if (!respData.success) {
            throw new Error(respData.errorMessage || "Failed to close project on ERP");
          }

          progress.report({
            increment: 50,
            message: "Deleting project folder...",
          });

          // Delete project folder
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (workspaceFolder) {
            const projectFolder = path.join(
              workspaceFolder.uri.fsPath,
              "Development",
              project.name,
            );

            if (fs.existsSync(projectFolder)) {
              fs.rmSync(projectFolder, { recursive: true, force: true });
            }
          }

          // Remove project from list
          await projectExplorerProvider.removeProject(project.name);

          progress.report({
            increment: 100,
            message: "Project closed successfully!",
          });

          vscode.window.showInformationMessage(
            `Project "${project.name}" closed successfully!`,
          );
        } catch (error: any) {
          console.error("Error closing project:", error);
          const errorMessage = error.response?.data
            ? Buffer.from(error.response.data).toString("utf-8")
            : error.message;
          vscode.window.showErrorMessage(
            `Failed to close project —  Reason: ${errorMessage}`,
          );
        }
      });
    },
  );

  vscode.commands.registerCommand("component-explorer.refresh", async () => {
    componentExplorerView.title = `Components [${vrc}]`;
    await refreshComponentView(componentExplorerProvider, serverUrl, vrc);
  });

  vscode.commands.registerCommand("component-explorer.configure", async () => {
    const setupComplete = await showSettingsForm();
    if (setupComplete) {
      componentExplorerView.title = `Components [${vrc}]`;
      await refreshComponentView(componentExplorerProvider, serverUrl, vrc);
    }
  });

  // Search components (lazy-load modules as needed)
  vscode.commands.registerCommand("component-explorer.search", async () => {
    // First, let user select component type
    // const componentTypeFilter = await vscode.window.showQuickPick(
    //   ["All", "Table", "Session", "Script"],
    //   {
    //     title: "Filter by Component Type",
    //     placeHolder: "Select component type to search in",
    //     ignoreFocusOut: true,
    //   }
    // );

    const componentTypeFilter = "All"; // Currently disabled, search all types

    if (componentTypeFilter === undefined) {
      return; // user cancelled
    }

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
      componentExplorerView.title = `Components [${vrc}]`;
      await refreshComponentView(componentExplorerProvider, serverUrl, vrc);
      return;
    }

    if (cleaned.length < 5) {
      vscode.window.showInformationMessage(
        "Please enter at least 5 characters to perform a search.",
      );
      return;
    }

    componentExplorerView.title = `Components [${vrc}] - Search: ${cleaned} (${componentTypeFilter})`;
    await componentExplorerProvider.searchAndRefresh(
      cleaned,
      serverUrl,
      componentTypeFilter,
    );
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
          context,
          componentExplorerProvider,
          serverUrl,
          vrc,
          projectExplorerProvider,
        );
      }
    },
  );

  // Import command for selected components view
  vscode.commands.registerCommand("selected-components.import", async () => {
    await importComponents(
      context,
      componentExplorerProvider,
      serverUrl,
      vrc,
      projectExplorerProvider,
    );
  });

  // Remove command for selected components view
  vscode.commands.registerCommand(
    "selected-components.remove",
    async (node?: TreeNode) => {
      if (node && node.component) {
        const removed = componentExplorerProvider.removeSelectedNode(node);
      }
    },
  );

  // Add a command to trigger import of all selected components
  vscode.commands.registerCommand(
    "component-explorer.importSelected",
    async () => {
      await importComponents(
        context,
        componentExplorerProvider,
        serverUrl,
        vrc,
        projectExplorerProvider,
      );
    },
  );

  // Import by PMC command for selected components view
  vscode.commands.registerCommand(
    "selected-components.importByPMC",
    async () => {
      await importComponentsByPMC(context, serverUrl, fetchVRCList);
    },
  );
}

async function importComponents(
  context: vscode.ExtensionContext,
  selectedProvider: ComponentDataProvider,
  serverUrl: string,
  defaultVrc: string,
  projectExplorerProvider: ProjectDataProvider,
) {
  const components = selectedProvider.getSelectedComponents();

  if (components.length === 0) {
    vscode.window.showWarningMessage("No components selected for import.");
    return;
  }

  // Check if there's an active project
  const activeProject = projectExplorerProvider.getActiveProject();
  
  let formData;
  if (activeProject) {
    // Use active project - ask for confirmation
    const useActive = await vscode.window.showInformationMessage(
      `Import to active project "${activeProject.name}"?`,
      "Yes",
      "No, choose different project",
    );

    if (useActive === "Yes") {
      formData = {
        projectName: activeProject.name,
        vrc: activeProject.vrc,
        role: activeProject.role,
        jiraId: activeProject.jiraId,
      };
    } else if (useActive === "No, choose different project") {
      // Show form to select/create project
      const vrcList: string[] = [];
      try {
        const data = await makeSoapRequest({
          serverUrl,
          method: "fetchVRCs",
          requestBody: {},
        });
        if (Array.isArray(data.vrcs)) {
          vrcList.push(...data.vrcs);
        }
      } catch (err) {
        console.warn("Failed to fetch VRCs from server");
      }

      formData = await showImportForm(context, vrcList, defaultVrc);
      if (!formData) {
        return; // User cancelled
      }
    } else {
      return; // User cancelled
    }
  } else {
    // No active project - show form
    let vrcList: string[] = [];
    try {
      const data = await makeSoapRequest({
        serverUrl,
        method: "fetchVRCs",
        requestBody: {},
      });
      if (Array.isArray(data.vrcs)) {
        vrcList = data.vrcs;
      }
    } catch (err) {
      console.warn("Failed to fetch VRCs from server");
    }

    formData = await showImportForm(context, vrcList, defaultVrc);
    if (!formData) {
      return; // User cancelled
    }
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found.");
    return;
  }

  const developmentFolder = path.join(
    workspaceFolder.uri.fsPath,
    "Development",
    formData.projectName,
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

      // Send SOAP request to ERP downloadComponents endpoint
      const respData = await makeSoapRequest({
        serverUrl,
        method: "downloadComponents",
        requestBody: {
          vrc: formData.vrc,
          importFolder: formData.projectName,
          components,
          username: os.userInfo().username,
          role: formData.role,
          jiraId: formData.jiraId,
        },
      });
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
          "No",
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
          (f) => f.toLowerCase() !== "script/manifest.csv",
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
        `Successfully imported ${components.length} component(s) to Development folder`,
      );
    } catch (error: any) {
      console.error("Error importing components:", error);
      const errorMessage = error.response?.data
        ? Buffer.from(error.response.data).toString("utf-8")
        : error.message;
      vscode.window.showErrorMessage(
        `Download Failed —  Reason: ${errorMessage}`,
      );
    }
  });
}

async function importComponentsByPMC(context: vscode.ExtensionContext, serverUrl: string, fetchVRCList: (pmc?: string) => Promise<string[]>) {
  // Initial VRC list (empty, will be fetched based on PMC)
  const vrcList: string[] = [];

  // Show import by PMC form with callback to fetch VRCs
  const formData = await showImportByPMCForm(context, vrcList, fetchVRCList);
  if (!formData) {
    return; // User cancelled
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found.");
    return;
  }

  // Use PMC number as folder name
  const developmentFolder = path.join(
    workspaceFolder.uri.fsPath,
    "Development",
    formData.pmc,
  );
  if (!fs.existsSync(developmentFolder)) {
    fs.mkdirSync(developmentFolder, { recursive: true });
  }

  const progressOptions: vscode.ProgressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: "Importing Components by PMC",
    cancellable: false,
  };

  await vscode.window.withProgress(progressOptions, async (progress) => {
    try {
      progress.report({
        increment: 0,
        message: `Fetching components for PMC ${formData.pmc}...`,
      });

      // Send SOAP request to ERP downloadComponentsByPMC endpoint
      const respData = await makeSoapRequest({
        serverUrl,
        method: "downloadComponentsByPMC",
        requestBody: {
          pmc: formData.pmc,
          vrc: formData.vrc,
          username: os.userInfo().username,
          role: formData.role,
          jiraId: formData.jiraId,
        },
      });
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
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ln-import-pmc-"));
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
          "No",
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
          (f) => f.toLowerCase() !== "script/manifest.csv",
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

      vscode.window.showInformationMessage(
        `Successfully imported components (PMC: ${formData.pmc}) to Development folder`,
      );
    } catch (error: any) {
      console.error("Error importing components by PMC:", error);
      const errorMessage = error.response?.data
        ? Buffer.from(error.response.data).toString("utf-8")
        : error.message;
      vscode.window.showErrorMessage(
        `Download by PMC Failed —  Reason: ${errorMessage}`,
      );
    }
  });
}

export function deactivate() {}
