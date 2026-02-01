import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as erpService from "../services/erp-service";
import type { Project } from "../types";
import { UPDATE_MODE } from "../types";

/**
 * Validates a project with ERP and creates/verifies project folder
 * 
 * @param project - The project to validate and setup
 * @param updateMode - The operation mode (CREATE, UPDATE, IMPORT, DELETE)
 * @param serverUrl - The backend server URL
 * @param username - The ERP username for authentication
 * @param password - The ERP password for authentication
 * @returns Promise resolving to true if validation and setup succeeded, false otherwise
 */
export async function validateAndSetupProject(
  project: Project,
  updateMode: UPDATE_MODE,
  serverUrl: string,
  username: string,
  password: string,
): Promise<boolean> {
  try {
    // Validate project with ERP
    if (!serverUrl) {
      vscode.window.showErrorMessage(
        `Backend URL not found for environment: ${project.environment}`,
      );
      return false;
    }

    const validationData = await erpService.validateProject(
      serverUrl,
      project.vrc,
      project.name,
      project.pmc,
      project.jiraId,
      project.role,
      username,
      password,
    );

    // Handle validation response
    if (
      validationData.errorMessage &&
      validationData.errorMessage.trim() !== ""
    ) {
      vscode.window.showErrorMessage(
        `Project validation failed: ${validationData.errorMessage}`,
      );
      return false;
    }

    // NOTE: Warning messages are now handled in the project form webview
    // So we skip showing them here

    if (!validationData.valid) {
      vscode.window.showErrorMessage(
        "Project validation failed. Please check the details.",
      );
      return false;
    }

    // Create project folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found.");
      return false;
    }

    const projectFolder = path.join(
      workspaceFolder.uri.fsPath,
      "Development",
      project.name,
    );

    if (updateMode === "CREATE") {
      if (fs.existsSync(projectFolder)) {
        const overwrite = await vscode.window.showWarningMessage(
          `Folder "${project.name}" already exists. Link to existing folder?`,
          "Yes",
          "No",
        );
        if (overwrite !== "Yes") {
          return false;
        }
      } else {
        fs.mkdirSync(projectFolder, { recursive: true });
      }
    }

    return true;
  } catch (err: any) {
    vscode.window.showErrorMessage(`Project setup failed: ${err.message}`);
    return false;
  }
}

/**
 * Gets the Development folder path for projects
 * 
 * @returns The Development folder path, or null if no workspace folder exists
 */
export function getDevelopmentFolderPath(): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return null;
  }
  return path.join(workspaceFolder.uri.fsPath, "Development");
}

/**
 * Gets the project folder path for a specific project
 * 
 * @param projectName - The name of the project
 * @returns The project folder path, or null if no workspace folder exists
 */
export function getProjectFolderPath(projectName: string): string | null {
  const devFolder = getDevelopmentFolderPath();
  if (!devFolder) {
    return null;
  }
  return path.join(devFolder, projectName);
}
