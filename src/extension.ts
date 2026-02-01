import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as crypto from "crypto";
import AdmZip from "adm-zip";
import {
  ComponentDataProvider,
  refreshComponentView,
  TreeNode,
  SelectedComponentsDataProvider,
} from "./views/data-providers/component-data-provider";
import {
  ProjectDataProvider,
  ProjectNode,
  FileNode,
} from "./views/data-providers/project-data-provider";
import { showProjectForm } from "./views/webviews/project-form-webview";
import { showTableViewer } from "./views/webviews/table-viewer-webview";
import { showSessionViewer } from "./views/webviews/session-viewer-webview";
import { showCompilationOutput } from "./views/webviews/compilation-output-webview";
import { showLoginForm } from "./views/webviews/login-webview";
import { UPDATE_MODE, Project } from "./types";
import * as erpService from "./services/erp-service";
import {
  loadSettingsFromFile,
  showAndSaveSettingsForm,
  getBackendUrl as getBackendUrlHelper,
} from "./extension-settings/settings-manager";
import { VRCCacheManager } from "./extension-settings/vrc-cache-manager";
import { validateAndSetupProject } from "./project-explorer/project-operations";
import { importComponents } from "./project-explorer/component-import";
import { updateComponentExplorerForActiveProject } from "./component-view/component-operations";
import { AuthManager } from "./services/auth-manager";

// Track compilation state
const compilationInProgress = new Map<string, boolean>();
const uploadedScripts = new Map<string, { hash: string; timestamp: number }>();

// Global auth manager instance
let authManager: AuthManager;

/**
 * Ensures user is authenticated before using the extension
 * @param context - The VS Code extension context
 * @param serverUrl - The ERP server URL for health check
 * @returns True if authenticated, false if user closed login without authenticating
 */
async function ensureAuthenticated(
  context: vscode.ExtensionContext,
  serverUrl: string,
): Promise<boolean> {
  const manager = new AuthManager(context);

  // Check if credentials exist
  const credentials = await manager.getCredentials();

  if (credentials) {
    // Verify credentials with health check
    try {
      const healthCheckResult = await erpService.healthCheck(
        serverUrl,
        credentials.username,
        credentials.password,
      );

      if (healthCheckResult.status === "UP") {
        vscode.window.showInformationMessage(
          `Welcome ${healthCheckResult.username}! You are logged in.`,
        );
        return true;
      }
    } catch (error: any) {
      console.error("Health check failed:", error);
      // Clear invalid credentials
      await manager.clearCredentials();
    }
  }

  // Show login form with callback
  const initialError = credentials
    ? "Your session has expired or credentials are invalid. Please login again."
    : undefined;

  const loginData = await showLoginForm(
    context,
    async (username: string, password: string) => {
      try {
        // Verify credentials with health check
        const healthCheckResult = await erpService.healthCheck(
          serverUrl,
          username,
          password,
        );

        if (healthCheckResult.status === "UP") {
          // Store credentials
          await manager.storeCredentials(username, password);
          vscode.window.showInformationMessage(
            `Welcome ${healthCheckResult.username}! You are now logged in.`,
          );
          return { username, password, success: true };
        } else {
          return {
            success: false,
            error:
              "Invalid credentials. Please check your username and password.",
          };
        }
      } catch (error: any) {
        console.error("Login failed:", error);
        const errorMessage =
          error.message ||
          "Unable to connect to ERP server. Please check your network connection.";
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
    initialError,
  );

  // If user closed the webview without logging in (empty credentials), return false
  if (!loginData.username || !loginData.password) {
    return false;
  }

  return true;
}

/**
 * Activates the ERP DevTools extension
 *
 * @param context - The VS Code extension context
 */
export async function activate(context: vscode.ExtensionContext) {
  // Always load settings from JSON file (resources) as the source of truth
  const settingsData = await loadSettingsFromFile(context);
  let environments = settingsData.environments;
  let defaultEnvironment = settingsData.defaultEnvironment;

  // Initialize auth manager
  authManager = new AuthManager(context);

  // Ensure user is authenticated before proceeding (non-blocking)
  if (defaultEnvironment) {
    const serverUrl = getBackendUrlHelper(defaultEnvironment, environments);
    
    try {
      const authenticated = await ensureAuthenticated(context, serverUrl);

      if (!authenticated) {
        vscode.window.showWarningMessage(
          "ERP DevTools: Not authenticated. Some features may not work. You can configure settings later to login.",
        );
      }
    } catch (error: any) {
      console.error("Authentication error:", error);
      vscode.window.showWarningMessage(
        "ERP DevTools: Authentication failed. Extension will load with limited functionality. You can try logging in later through settings.",
      );
    }
  } else {
    vscode.window.showWarningMessage(
      "ERP DevTools: No default environment configured. Please configure extension settings.",
    );
  }

  // Initialize VRC cache manager
  const vrcCacheManager = new VRCCacheManager();

  /**
   * Helper function to get backend URL for an environment
   *
   * @param environment - The environment name
   * @returns The backend URL
   */
  function getBackendUrl(environment: string): string {
    return getBackendUrlHelper(environment, environments);
  }

  /**
   * Helper function to get stored credentials
   * @returns The stored credentials or empty credentials if not found
   */
  async function getCredentials(): Promise<{
    username: string;
    password: string;
  }> {
    const creds = await authManager.getCredentials();

    if (!creds) {
      // Return empty credentials - allow extension to try operations
      // Operations will fail gracefully with appropriate error messages
      return { username: "", password: "" };
    }
    return creds;
  }

  /**
   * Fetches VRC list for an environment with caching
   *
   * @param environment - The environment name
   * @param pmc - Optional PMC number to filter VRCs
   * @returns Promise resolving to array of VRC strings
   */
  async function fetchVRCList(
    environment: string,
    pmc?: string,
  ): Promise<string[]> {
    const serverUrl = getBackendUrl(environment);
    const creds = await getCredentials();
    return vrcCacheManager.fetchVRCList(
      environment,
      serverUrl,
      creds.username,
      creds.password,
      pmc,
    );
  }

  const projectExplorerProvider = new ProjectDataProvider(context);
  const componentExplorerProvider = new ComponentDataProvider(context);
  const selectedComponentsProvider = new SelectedComponentsDataProvider(
    componentExplorerProvider,
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

  // Set initial title based on active project
  const activeProject = projectExplorerProvider.getActiveProject();
  if (activeProject) {
    componentExplorerView.title = `Components [${activeProject.vrc}]`;
    const serverUrl = getBackendUrl(activeProject.environment);
    const creds = await getCredentials();

    // Set the active project settings in the component data provider
    componentExplorerProvider.setActiveProjectSettings(
      serverUrl,
      activeProject.vrc,
      creds.username,
      creds.password,
    );

    await refreshComponentView(
      componentExplorerProvider,
      serverUrl,
      activeProject.vrc,
      creds.username,
      creds.password,
    );
  } else {
    componentExplorerView.title = `Components (No Active Project)`;
  }

  // Project Explorer Commands
  vscode.commands.registerCommand("project-explorer.refresh", () => {
    projectExplorerProvider.refresh();
  });

  vscode.commands.registerCommand("project-explorer.addProject", async () => {
    if (!defaultEnvironment) {
      vscode.window.showErrorMessage(
        "Please configure extension settings first.",
      );
      return;
    }

    const vrcList = await fetchVRCList(defaultEnvironment);
    const environmentList = environments.map((e) => e.environment);
    const updateMode: UPDATE_MODE = "CREATE";
    const project = await showProjectForm(
      context,
      updateMode,
      vrcList,
      environmentList,
      {
        name: "",
        pmc: "",
        jiraId: "",
        vrc: "",
        role: "",
        environment: defaultEnvironment,
        createdAt: Date.now(),
      },
      (pmc: string, environment: string) => fetchVRCList(environment, pmc),
      async (proj: Project) => {
        // Validation callback
        const serverUrl = getBackendUrl(proj.environment);
        const creds = await getCredentials();
        return await erpService.validateProject(
          serverUrl,
          proj.vrc,
          proj.name,
          proj.pmc,
          proj.jiraId,
          proj.role,
          creds.username,
          creds.password,
        );
      },
    );

    if (project) {
      const serverUrl = getBackendUrl(project.environment);
      const creds = await getCredentials();
      const success = await validateAndSetupProject(
        project,
        updateMode,
        serverUrl,
        creds.username,
        creds.password,
      );
      if (success) {
        try {
          await projectExplorerProvider.addProject(project);
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `Failed to create project: ${err.message}`,
          );
        }
      }
    }
  });

  vscode.commands.registerCommand(
    "project-explorer.importProject",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found.");
        return;
      }

      const developmentFolder = path.join(
        workspaceFolder.uri.fsPath,
        "Development",
      );
      if (!fs.existsSync(developmentFolder)) {
        vscode.window.showErrorMessage(
          "Development folder not found. Create a project first.",
        );
        return;
      }

      const projectNames = new Set(
        projectExplorerProvider.getAllProjects().map((p) => p.name),
      );

      // Get list of folders in Development directory and filter out folders that are already projects
      const folders: string[] = [];
      for (const d of fs.readdirSync(developmentFolder, {
        withFileTypes: true,
      })) {
        if (d.isDirectory() && !projectNames.has(d.name)) {
          folders.push(d.name);
        }
      }

      if (folders.length === 0) {
        vscode.window.showWarningMessage(
          "No folders found for import in Development directory.",
        );
        return;
      }

      // Show quick pick to select folder
      const selectedFolder = await vscode.window.showQuickPick(folders, {
        placeHolder: "Select a folder to import as project",
        ignoreFocusOut: true,
      });

      if (!selectedFolder) {
        return;
      }

      // Show project form with the selected folder name
      const vrcList = await fetchVRCList(defaultEnvironment);
      const environmentList = environments.map((e) => e.environment);
      const updateMode: UPDATE_MODE = "IMPORT";
      const project = await showProjectForm(
        context,
        updateMode,
        vrcList,
        environmentList,
        {
          name: selectedFolder,
          pmc: "",
          jiraId: "",
          vrc: "",
          role: "Developer",
          environment: defaultEnvironment,
          createdAt: Date.now(),
        },
        (pmc: string, environment: string) => fetchVRCList(environment, pmc),
        async (proj: Project) => {
          // Validation callback
          const serverUrl = getBackendUrl(proj.environment);
          const creds = await getCredentials();
          return await erpService.validateProject(
            serverUrl,
            proj.vrc,
            proj.name,
            proj.pmc,
            proj.jiraId,
            proj.role,
            creds.username,
            creds.password,
          );
        },
      );

      if (project) {
        const serverUrl = getBackendUrl(project.environment);
        const creds = await getCredentials();
        const success = await validateAndSetupProject(
          project,
          updateMode,
          serverUrl,
          creds.username,
          creds.password,
        );
        if (success) {
          try {
            await projectExplorerProvider.addProject(project);
          } catch (err: any) {
            vscode.window.showErrorMessage(
              `Failed to import project: ${err.message}`,
            );
          }
        }
      }
    },
  );

  vscode.commands.registerCommand(
    "project-explorer.editProject",
    async (node?: ProjectNode) => {
      if (!node || !node.project) {
        return;
      }

      // Check if project folder has any files
      if (projectExplorerProvider.projectFolderHasFiles(node.project.name)) {
        vscode.window.showWarningMessage(
          `Cannot edit project "${node.project.name}" because it contains files. Please remove all files from the project folder before editing.`,
        );
        return;
      }

      const vrcList = await fetchVRCList(node.project.environment);
      const environmentList = environments.map((e) => e.environment);
      const updateMode: UPDATE_MODE = "UPDATE";
      const updatedProject = await showProjectForm(
        context,
        updateMode,
        vrcList,
        environmentList,
        node.project,
        (pmc: string, environment: string) => fetchVRCList(environment, pmc),
        async (proj: Project) => {
          // Validation callback
          const serverUrl = getBackendUrl(proj.environment);
          const creds = await getCredentials();
          return await erpService.validateProject(
            serverUrl,
            proj.vrc,
            proj.name,
            proj.pmc,
            proj.jiraId,
            proj.role,
            creds.username,
            creds.password,
          );
        },
      );

      if (updatedProject) {
        const serverUrl = getBackendUrl(updatedProject.environment);
        const creds = await getCredentials();
        const success = await validateAndSetupProject(
          updatedProject,
          updateMode,
          serverUrl,
          creds.username,
          creds.password,
        );
        if (success) {
          try {
            await projectExplorerProvider.updateProject(
              node.project.name,
              updatedProject,
            );

            // If this was the active project, update component explorer
            const activeProject = projectExplorerProvider.getActiveProject();
            if (activeProject && activeProject.name === updatedProject.name) {
              await updateComponentExplorerForActiveProject(
                componentExplorerView,
                componentExplorerProvider,
                projectExplorerProvider,
                getBackendUrl,
                getCredentials,
              );
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(
              `Failed to update project: ${err.message}`,
            );
          }
        }
      }
    },
  );

  // Register tree view for project explorer to handle selection and drag-drop
  const projectExplorerTreeView = vscode.window.createTreeView(
    "project-explorer",
    {
      treeDataProvider: projectExplorerProvider,
      dragAndDropController: projectExplorerProvider.dragAndDropController,
    },
  );

  // Auto-activate project on single click (selection change)
  // Note: VS Code tree views expand on double-click by default
  projectExplorerTreeView.onDidChangeSelection(async (e) => {
    if (e.selection.length > 0) {
      const selectedItem = e.selection[0];
      if (selectedItem instanceof ProjectNode && selectedItem.project) {
        try {
          // If project is already active then do not activate again
          const activeProject = projectExplorerProvider.getActiveProject();
          if (
            !activeProject ||
            activeProject.name !== selectedItem.project.name
          ) {
            await projectExplorerProvider.setActiveProject(
              selectedItem.project.name,
            );
            await updateComponentExplorerForActiveProject(
              componentExplorerView,
              componentExplorerProvider,
              projectExplorerProvider,
              getBackendUrl,
              getCredentials,
            );
          }
        } catch (err: any) {
          console.error("Failed to set active project:", err);
        }
      }
    }
  });

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

      // Check if existing Script, Session, Table exists
      const foldersToCheck = ["Script", "Session", "Table"];
      let filesExists: boolean = false;

      for (const folder of foldersToCheck) {
        const folderPath = path.join(developmentFolder, folder);

        if (fs.existsSync(folderPath)) {
          const files = fs.readdirSync(folderPath);
          if (files.length > 0) {
            filesExists = true;
            break;
          }
        }
      }

      if (filesExists) {
        const importByPMCChoice = await vscode.window.showWarningMessage(
          "Importing components from PMC will remove all existing scripts, sessions, and tables in this project and replace them with the selected PMC components. Do you want to continue?",
          "Continue Import",
          "Cancel",
        );

        if (importByPMCChoice !== "Continue Import") {
          return;
        }
      }

      const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: "Importing Components by PMC",
        cancellable: true,
      };

      await vscode.window.withProgress(
        progressOptions,
        async (progress, token) => {
          const abortController = new AbortController();

          // Handle cancellation
          token.onCancellationRequested(() => {
            abortController.abort();
          });

          try {
            progress.report({
              increment: 0,
              message: `Fetching components for PMC ${project.pmc}...`,
            });

            const serverUrl = getBackendUrl(project.environment);
            if (!serverUrl) {
              throw new Error(
                `Backend URL not found for environment: ${project.environment}`,
              );
            }

            const creds = await getCredentials();

            // Send SOAP request to ERP downloadComponentsByPMC endpoint
            const respData = await erpService.downloadComponentsByPMC(
              serverUrl,
              project.pmc,
              project.vrc,
              project.name,
              project.role,
              project.jiraId,
              creds.username,
              creds.password,
              abortController.signal,
            );
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
            const tempDir = fs.mkdtempSync(
              path.join(os.tmpdir(), "ln-import-pmc-"),
            );
            zip.extractAllTo(tempDir, true);

            // 1.5 Remove all Script/Session/Table files if user selected Continue Import
            const foldersToRemove = ["Script", "Session", "Table"];
            for (const folder of foldersToRemove) {
              const folderPath = path.join(developmentFolder, folder);

              if (fs.existsSync(folderPath)) {
                fs.rmSync(folderPath, { recursive: true, force: true });
              }
            }

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

            // Refresh project explorer to show new files
            projectExplorerProvider.refresh();

            vscode.window.showInformationMessage(
              `Successfully imported components (PMC: ${project.pmc}) to project "${project.name}"`,
            );
          } catch (error: any) {
            // Check if user cancelled
            if (
              error?.name === "AbortError" ||
              error?.name === "CanceledError" ||
              error.message?.includes("cancelled")
            ) {
              vscode.window.showInformationMessage(
                "Component import cancelled.",
              );
              return;
            }

            console.error("Error importing components by PMC:", error);
            const errorMessage = error.response?.data
              ? Buffer.from(error.response.data).toString("utf-8")
              : error.message;
            vscode.window.showErrorMessage(
              `Download by PMC Failed —  Reason: ${errorMessage}`,
            );
          }
        },
      );
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
        `Are you sure you want to close project "${project.name}"? This will send a close request to ERP and delete ERP components from the project.`,
        "Yes, Close Project",
        "No",
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

          const serverUrl = getBackendUrl(project.environment);
          if (!serverUrl) {
            throw new Error(
              `Backend URL not found for environment: ${project.environment}`,
            );
          }

          const creds = await getCredentials();

          // Send SOAP request to ERP closeProject endpoint
          const respData = await erpService.closeProject(
            serverUrl,
            project.pmc,
            project.vrc,
            project.name,
            project.role,
            project.jiraId,
            creds.username,
            creds.password,
          );

          if (!respData.success) {
            throw new Error(
              respData.errorMessage || "Failed to close project on ERP",
            );
          }

          progress.report({
            increment: 50,
            message: "Deleting ERP components...",
          });

          // Delete only Scripts, Sessions, and Tables folders (not the entire project)
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (workspaceFolder) {
            const projectFolder = path.join(
              workspaceFolder.uri.fsPath,
              "Development",
              project.name,
            );

            if (fs.existsSync(projectFolder)) {
              // Delete component folders individually
              const foldersToDelete = ["Script", "Session", "Table"];
              for (const folder of foldersToDelete) {
                const folderPath = path.join(projectFolder, folder);
                if (fs.existsSync(folderPath)) {
                  fs.rmSync(folderPath, { recursive: true, force: true });
                }
              }
            }
          }

          // Remove project from list
          await projectExplorerProvider.removeProject(project.name);

          progress.report({
            increment: 100,
            message: "Project closed successfully!",
          });
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
    await updateComponentExplorerForActiveProject(
      componentExplorerView,
      componentExplorerProvider,
      projectExplorerProvider,
      getBackendUrl,
      getCredentials,
    );
  });

  vscode.commands.registerCommand("component-explorer.configure", async () => {
    const settings = await showAndSaveSettingsForm(
      context,
      environments,
      defaultEnvironment,
    );
    if (settings) {
      // Update local references
      environments = settings.environments;
      defaultEnvironment = settings.defaultEnvironment;

      await updateComponentExplorerForActiveProject(
        componentExplorerView,
        componentExplorerProvider,
        projectExplorerProvider,
        getBackendUrl,
        getCredentials,
      );
    }
  });

  // Search components (lazy-load modules as needed)
  vscode.commands.registerCommand("component-explorer.search", async () => {
    const activeProject = projectExplorerProvider.getActiveProject();
    if (!activeProject) {
      vscode.window.showWarningMessage(
        "Please select an active project first.",
      );
      return;
    }

    const serverUrl = getBackendUrl(activeProject.environment);
    if (!serverUrl) {
      vscode.window.showErrorMessage(
        `Backend URL not found for environment: ${activeProject.environment}`,
      );
      return;
    }

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
      const creds = await getCredentials();
      componentExplorerView.title = `Components [${activeProject.vrc}]`;
      await refreshComponentView(
        componentExplorerProvider,
        serverUrl,
        activeProject.vrc,
        creds.username,
        creds.password,
      );
      return;
    }

    if (cleaned.length < 5) {
      vscode.window.showWarningMessage(
        "Please enter at least 5 characters to perform a search.",
      );
      return;
    }

    componentExplorerView.title = `Components [${activeProject.vrc}] - Search: ${cleaned} (${componentTypeFilter})`;
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
          projectExplorerProvider,
          getBackendUrl,
          environments,
          fetchVRCList,
          getCredentials,
        );
      }
    },
  );

  // Import command for selected components view
  vscode.commands.registerCommand("selected-components.import", async () => {
    await importComponents(
      context,
      componentExplorerProvider,
      projectExplorerProvider,
      getBackendUrl,
      environments,
      fetchVRCList,
      getCredentials,
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
        projectExplorerProvider,
        getBackendUrl,
        environments,
        fetchVRCList,
        getCredentials,
      );
    },
  );

  // Command to open Table JSON viewer
  vscode.commands.registerCommand(
    "project-explorer.openTableViewer",
    async (fileUri: vscode.Uri) => {
      try {
        const fileContent = fs.readFileSync(fileUri.fsPath, "utf-8");
        const tableData = JSON.parse(fileContent);
        showTableViewer(context, tableData);
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to open table viewer: ${error.message}`,
        );
      }
    },
  );

  // Command to open Session JSON viewer
  vscode.commands.registerCommand(
    "project-explorer.openSessionViewer",
    async (fileUri: vscode.Uri) => {
      try {
        const fileContent = fs.readFileSync(fileUri.fsPath, "utf-8");
        const sessionData = JSON.parse(fileContent);
        showSessionViewer(context, sessionData);
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to open session viewer: ${error.message}`,
        );
      }
    },
  );

  // Command to copy file
  vscode.commands.registerCommand(
    "project-explorer.copyFile",
    async (node: any) => {
      if (node && node.resourceUri) {
        await vscode.env.clipboard.writeText(node.resourceUri.fsPath);
        vscode.window.showInformationMessage("File path copied to clipboard");
      }
    },
  );

  // Command to copy full path
  vscode.commands.registerCommand(
    "project-explorer.copyPath",
    async (node: any) => {
      if (node && node.resourceUri) {
        await vscode.env.clipboard.writeText(node.resourceUri.fsPath);
        vscode.window.showInformationMessage("Path copied to clipboard");
      }
    },
  );

  // Command to copy relative path
  vscode.commands.registerCommand(
    "project-explorer.copyRelativePath",
    async (node: any) => {
      if (node && node.resourceUri) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const relativePath = path.relative(
            workspaceFolders[0].uri.fsPath,
            node.resourceUri.fsPath,
          );
          await vscode.env.clipboard.writeText(relativePath);
          vscode.window.showInformationMessage(
            "Relative path copied to clipboard",
          );
        }
      }
    },
  );

  // Command to reveal in file explorer
  vscode.commands.registerCommand(
    "project-explorer.revealInExplorer",
    async (node: any) => {
      if (node && node.resourceUri) {
        await vscode.commands.executeCommand(
          "revealFileInOS",
          node.resourceUri,
        );
      }
    },
  );

  // Command to open in integrated terminal
  vscode.commands.registerCommand(
    "project-explorer.openInTerminal",
    async (node: any) => {
      if (node && node.resourceUri) {
        const filePath = node.resourceUri.fsPath;
        const dirPath = fs.statSync(filePath).isDirectory()
          ? filePath
          : path.dirname(filePath);
        const terminal = vscode.window.createTerminal({
          cwd: dirPath,
          name: `Terminal - ${path.basename(dirPath)}`,
        });
        terminal.show();
      }
    },
  );

  // Command to open file with proper language detection
  vscode.commands.registerCommand(
    "project-explorer.openFile",
    async (fileUri: vscode.Uri) => {
      try {
        // Open the document and show it in the editor
        // VS Code automatically detects language based on file extension
        const document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document, {
          preview: true,
          preserveFocus: false,
        });
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
      }
    },
  );

  // Command to compile Baan script (.bc file)
  vscode.commands.registerCommand(
    "project-explorer.compileScript",
    async (node: FileNode) => {
      let filePath: string;
      let fileName: string;

      if (!node || !node.resourceUri) {
        // invoked from editor/title
        const activeEditor = vscode.window.activeTextEditor;

        if (!activeEditor) {
          vscode.window.showErrorMessage("No active editor to compile.");
          return;
        }

        filePath = activeEditor.document.uri.fsPath;
        fileName = path.basename(filePath);
      } else {
        filePath = node.resourceUri.fsPath;
        fileName = node.fileName;
      }

      // Parse script info from filename (e.g., tdexttesting.bc -> td/ext/testing)
      const scriptName = fileName.replace(".bc", "");
      let pkg = "";
      let module = "";
      let code = "";

      if (scriptName.length >= 2) {
        pkg = scriptName.substring(0, 2);
        if (scriptName.length >= 5) {
          module = scriptName.substring(2, 5);
          code = scriptName.substring(5);
        }
      }

      if (!pkg || !module || !code) {
        vscode.window.showErrorMessage(
          `Invalid script name format: ${scriptName}. Expected format: [package][module][code].bc`,
        );
        return;
      }

      // Check if compilation is already in progress for this script
      if (compilationInProgress.get(filePath)) {
        vscode.window.showWarningMessage(
          `Compilation already in progress for ${scriptName}`,
        );
        return;
      }

      // Find the project this file belongs to
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found.");
        return;
      }

      const developmentFolder = path.join(
        workspaceFolder.uri.fsPath,
        "Development",
      );
      let projectName = "";
      let project = null;

      // Find which project this file belongs to
      for (const p of projectExplorerProvider.getAllProjects()) {
        const projectFolder = path.join(developmentFolder, p.name);
        if (filePath.startsWith(projectFolder)) {
          projectName = p.name;
          project = p;
          break;
        }
      }

      if (!project) {
        vscode.window.showErrorMessage(
          "Could not determine which project this script belongs to.",
        );
        return;
      }

      const serverUrl = getBackendUrl(project.environment);
      if (!serverUrl) {
        vscode.window.showErrorMessage(
          `Backend URL not found for environment: ${project.environment}`,
        );
        return;
      }

      // Mark compilation as in progress
      compilationInProgress.set(filePath, true);

      const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: `Compiling ${scriptName}`,
        cancellable: false,
      };

      await vscode.window.withProgress(progressOptions, async (progress) => {
        try {
          progress.report({
            increment: 0,
            message: "Reading script file...",
          });

          // Read file and calculate hash
          const fileContent = fs.readFileSync(filePath, "utf-8");
          const fileHash = crypto
            .createHash("md5")
            .update(fileContent)
            .digest("hex");

          // Check if file has been modified since last upload
          const scriptKey = `${project.name}:${scriptName}`;
          const previousUpload = uploadedScripts.get(scriptKey);
          const needsUpload =
            !previousUpload || previousUpload.hash !== fileHash;

          let scriptIdentifier = scriptName;

          if (needsUpload) {
            progress.report({
              increment: 20,
              message: "File modified, uploading script to ERP...",
            });

            const creds = await getCredentials();

            // Upload script (sends base64 of ZIP of .bc file)
            const uploadResult = await erpService.uploadScript(
              serverUrl,
              scriptName,
              fileContent,
              project.vrc,
              project.name,
              project.pmc,
              project.jiraId,
              project.role,
              creds.username,
              creds.password,
            );

            if (!uploadResult.success) {
              throw new Error(
                uploadResult.errorMessage || "Failed to upload script",
              );
            }

            scriptIdentifier = uploadResult.script;

            // Update uploaded scripts cache
            uploadedScripts.set(scriptKey, {
              hash: fileHash,
              timestamp: Date.now(),
            });

            progress.report({
              increment: 60,
              message: "Compiling script on ERP...",
            });
          } else {
            progress.report({
              increment: 50,
              message: "File unchanged, compiling script on ERP...",
            });
          }

          // Get credentials for compile request
          const creds = await getCredentials();

          // Compile script (receives base64 of ZIP of output files)
          const compileResult = await erpService.compileScript(
            serverUrl,
            scriptIdentifier,
            project.vrc,
            project.name,
            project.pmc,
            project.jiraId,
            project.role,
            creds.username,
            creds.password,
          );

          progress.report({
            increment: 100,
            message: "Compilation complete!",
          });

          // Show compilation output
          showCompilationOutput(context, {
            script: scriptIdentifier,
            success: compileResult.compileSuccess,
            output: compileResult.compilationOutput,
          });
        } catch (error: any) {
          console.error("Error compiling script:", error);
          const errorMessage = error.response?.data
            ? Buffer.from(error.response.data).toString("utf-8")
            : error.message;
          vscode.window.showErrorMessage(
            `Compilation Failed — Reason: ${errorMessage}`,
          );
        } finally {
          // Clear compilation in progress flag
          compilationInProgress.delete(filePath);
        }
      });
    },
  );
}

/**
 * Deactivates the extension
 */
export function deactivate() {}
