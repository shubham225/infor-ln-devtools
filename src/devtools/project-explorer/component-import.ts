import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import AdmZip from "adm-zip";
import * as erpService from "../services/erp-service";
import type { EnvironmentMapping } from "../types/api";
import type { Project } from "../types";
import { UPDATE_MODE } from "../types";
import { ComponentDataProvider } from "../views/data-providers/component-data-provider";
import { ProjectDataProvider } from "../views/data-providers/project-data-provider";
import { showProjectForm } from "../views/webviews/project-form-webview";

/**
 * Handles component import workflow including project selection/creation
 * 
 * @param context - The VS Code extension context
 * @param selectedProvider - The component data provider with selected components
 * @param projectExplorerProvider - The project data provider
 * @param getBackendUrl - Function to get backend URL for an environment
 * @param environments - Array of environment mappings
 * @param fetchVRCList - Function to fetch VRC list
 * @param getCredentials - Function to get authentication credentials
 * @returns Promise that resolves when import is complete
 */
export async function importComponents(
  context: vscode.ExtensionContext,
  selectedProvider: ComponentDataProvider,
  projectExplorerProvider: ProjectDataProvider,
  getBackendUrl: (environment: string) => string,
  environments: EnvironmentMapping[],
  fetchVRCList: (environment: string, pmc?: string) => Promise<string[]>,
  getCredentials: () => Promise<{ username: string; password: string }>,
): Promise<void> {
  const components = selectedProvider.getSelectedComponents();

  if (components.length === 0) {
    vscode.window.showWarningMessage("No components selected for import.");
    return;
  }

  // Check if there's an active project
  const activeProject = projectExplorerProvider.getActiveProject();

  let formData;
  let newProject: Project | null = null;

  if (activeProject) {
    // Use active project - ask for confirmation or create new
    const choice = await vscode.window.showInformationMessage(
      `Import to active project "${activeProject.name}"?`,
      "Yes",
      "No, create new project",
      "Cancel",
    );

    if (choice === "Yes") {
      formData = {
        projectName: activeProject.name,
        vrc: activeProject.vrc,
        role: activeProject.role,
        ticketId: activeProject.ticketId,
      };
    } else if (choice === "No, create new project") {
      newProject = await createNewProjectForImport(
        context,
        environments,
        getBackendUrl,
        fetchVRCList,
        projectExplorerProvider,
        getCredentials,
      );
      if (!newProject) {
        return;
      }
      formData = {
        projectName: newProject.name,
        vrc: newProject.vrc,
        role: newProject.role,
        ticketId: newProject.ticketId,
      };
    } else {
      return; // User cancelled
    }
  } else {
    // No active project - must create new project
    const choice = await vscode.window.showWarningMessage(
      "No active project found. Create a new project to import components?",
      "Create Project",
      "Cancel",
    );

    if (choice !== "Create Project") {
      return;
    }

    newProject = await createNewProjectForImport(
      context,
      environments,
      getBackendUrl,
      fetchVRCList,
      projectExplorerProvider,
      getCredentials,
    );
    if (!newProject) {
      return;
    }
    formData = {
      projectName: newProject.name,
      vrc: newProject.vrc,
      role: newProject.role,
      ticketId: newProject.ticketId,
    };
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
    cancellable: true,
  };

  await vscode.window.withProgress(progressOptions, async (progress, token) => {
    const abortController = new AbortController();
    
    // Handle cancellation
    token.onCancellationRequested(() => {
      abortController.abort();
    });

    try {
      progress.report({
        increment: 0,
        message: `Sending ${components.length} component(s) to server...`,
      });

      // Get the project to find its environment
      const project = projectExplorerProvider.getProject(formData.projectName);
      if (!project) {
        throw new Error("Project not found");
      }

      const serverUrl = getBackendUrl(project.environment);
      if (!serverUrl) {
        throw new Error(
          `Backend URL not found for environment: ${project.environment}`,
        );
      }

      const creds = await getCredentials();

      // Send SOAP request to ERP downloadComponents endpoint
      const resp = await erpService.downloadComponents(
        serverUrl,
        project,
        components,
        creds,
        abortController.signal,
      );
      const buf = resp?.data;
      if (!buf || !Buffer.isBuffer(buf)) {
        throw new Error("Invalid response from server");
      }

      progress.report({ increment: 50, message: "Received zip data, extracting..." });

      // Extract zip file from binary payload
      await extractAndMergeComponents(buf, developmentFolder);

      progress.report({
        increment: 100,
        message: "Extraction complete!",
      });

      // Clear selected components after successful import
      selectedProvider.clearAll();

      // Refresh project explorer to show new files
      projectExplorerProvider.refresh();
    } catch (error: any) {
      // Check if user cancelled
      if (error?.name === "AbortError" || error?.name === "CanceledError" || error.message?.includes("cancelled")) {
        vscode.window.showInformationMessage("Component import cancelled.");
        return;
      }

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

/**
 * Creates a new project for component import workflow
 * 
 * @param context - The VS Code extension context
 * @param environments - Array of environment mappings
 * @param getBackendUrl - Function to get backend URL for an environment
 * @param fetchVRCList - Function to fetch VRC list
 * @param projectExplorerProvider - The project data provider
 * @param getCredentials - Function to get authentication credentials
 * @returns Promise resolving to the created project, or null if cancelled
 */
async function createNewProjectForImport(
  context: vscode.ExtensionContext,
  environments: EnvironmentMapping[],
  getBackendUrl: (environment: string) => string,
  fetchVRCList: (environment: string, pmc?: string) => Promise<string[]>,
  projectExplorerProvider: ProjectDataProvider,
  getCredentials: () => Promise<{ username: string; password: string }>,
): Promise<Project | null> {
  const defaultEnv = environments.length > 0 ? environments[0].environment : "";
  const vrcList: string[] = [];

  if (defaultEnv) {
    const serverUrl = getBackendUrl(defaultEnv);
    try {
      const creds = await getCredentials();
      const vrcs = await erpService.fetchVRCs(serverUrl, creds);
      vrcList.push(...vrcs);
    } catch (err) {
      console.warn("Failed to fetch VRCs from server");
    }
  }

  const environmentList = environments.map((e) => e.environment);
  const updateMode: UPDATE_MODE = "CREATE";
  const newProject = await showProjectForm(
    context,
    updateMode,
    vrcList,
    environmentList,
    {
      name: "",
      pmc: "",
      ticketId: "",
      vrc: "",
      role: "",
      environment: defaultEnv,
      createdAt: Date.now(),
    },
    (pmc: string, environment: string) => fetchVRCList(environment, pmc),
  );
  if (!newProject) {
    return null;
  }

  // Validate new project
  const serverUrl = getBackendUrl(newProject.environment);
  if (!serverUrl) {
    vscode.window.showErrorMessage(
      `Backend URL not found for environment: ${newProject.environment}`,
    );
    return null;
  }

  try {
    const creds = await getCredentials();
    const validationData = await erpService.validateProject(serverUrl, newProject, creds);

    if (
      validationData.errorMessage &&
      validationData.errorMessage.trim() !== ""
    ) {
      vscode.window.showErrorMessage(
        `Project validation failed: ${validationData.errorMessage}`,
      );
      return null;
    }

    if (
      validationData.warningMessage &&
      validationData.warningMessage.trim() !== ""
    ) {
      vscode.window.showWarningMessage(validationData.warningMessage);
    }

    if (!validationData.valid) {
      vscode.window.showErrorMessage(
        "Project validation failed. Please check the details.",
      );
      return null;
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `Project validation failed: ${err.message}`,
    );
    return null;
  }

  // Create project folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found.");
    return null;
  }

  const projectFolder = path.join(
    workspaceFolder.uri.fsPath,
    "Development",
    newProject.name,
  );

  if (fs.existsSync(projectFolder)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Folder "${newProject.name}" already exists. Use existing folder?`,
      "Yes",
      "No",
    );
    if (overwrite !== "Yes") {
      return null;
    }
  } else {
    fs.mkdirSync(projectFolder, { recursive: true });
  }

  // Add project to list
  try {
    await projectExplorerProvider.addProject(newProject);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to create project: ${err.message}`);
    return null;
  }

  return newProject;
}

/**
 * Extracts components from a binary ZIP Buffer and merges with existing project files
 *
 * @param zipBuffer - ZIP as a Buffer
 * @param targetFolder - Target folder path for extraction
 */
async function extractAndMergeComponents(
  zipBuffer: Buffer,
  targetFolder: string,
): Promise<void> {
  const zip = new AdmZip(zipBuffer);

  // 1. extract to temp
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ln-import-"));
  zip.extractAllTo(tempDir, true);

  // 2. collect conflicts (except manifest.csv)
  const targetRoot = targetFolder;
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
}
