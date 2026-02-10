import * as vscode from "vscode";
import {
  ComponentDataProvider,
  refreshComponentView,
} from "../views/data-providers/component-data-provider";
import { ProjectDataProvider } from "../views/data-providers/project-data-provider";

/**
 * Updates the component explorer view based on the active project
 *
 * @param componentExplorerView - The component explorer tree view
 * @param componentExplorerProvider - The component data provider
 * @param projectExplorerProvider - The project data provider
 * @param getBackendUrl - Function to get backend URL for an environment
 * @param getCredentials - Function to get authentication credentials
 * @returns Promise that resolves when update is complete
 */
export async function updateComponentExplorerForActiveProject(
  componentExplorerView: vscode.TreeView<any>,
  componentExplorerProvider: ComponentDataProvider,
  projectExplorerProvider: ProjectDataProvider,
  getBackendUrl: (environment: string) => string,
  getCredentials: () => Promise<{ username: string; password: string }>,
): Promise<void> {
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
    componentExplorerProvider.clearData();
  }
}
