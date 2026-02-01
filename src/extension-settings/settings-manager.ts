import * as vscode from "vscode";
import { showConfigurationForm } from "../views/webviews/config-webview";
import type { EnvironmentMapping } from "../types/api";

/**
 * Loads extension settings from the JSON configuration file
 * 
 * @param context - The VS Code extension context
 * @returns Promise resolving to settings object containing environments and default environment
 */
export async function loadSettingsFromFile(
  context: vscode.ExtensionContext,
): Promise<{ environments: EnvironmentMapping[]; defaultEnvironment: string }> {
  try {
    const defaultSettingsUri = vscode.Uri.joinPath(
      context.extensionUri,
      "resources",
      "extension-settings.json",
    );
    const settingsData =
      await vscode.workspace.fs.readFile(defaultSettingsUri);
    const defaultSettings = JSON.parse(settingsData.toString());

    const environments: EnvironmentMapping[] =
      defaultSettings.environments || [];
    const defaultEnvironment: string = defaultSettings.defaultEnvironment || "";

    console.log(
      "Loaded extension settings from resources/extension-settings.json",
    );

    return { environments, defaultEnvironment };
  } catch (err) {
    console.error("Failed to load extension settings:", err);
    vscode.window.showErrorMessage(
      "Failed to load extension settings. Please check resources/extension-settings.json file.",
    );
    return { environments: [], defaultEnvironment: "" };
  }
}

/**
 * Saves extension settings back to the JSON configuration file
 * 
 * @param context - The VS Code extension context
 * @param environments - Array of environment mappings
 * @param defaultEnvironment - Default environment name
 * @returns Promise resolving to true if save was successful, false otherwise
 */
export async function saveSettingsToFile(
  context: vscode.ExtensionContext,
  environments: EnvironmentMapping[],
  defaultEnvironment: string,
): Promise<boolean> {
  try {
    const settingsUri = vscode.Uri.joinPath(
      context.extensionUri,
      "resources",
      "extension-settings.json",
    );
    const settingsData = JSON.stringify(
      {
        environments,
        defaultEnvironment,
      },
      null,
      2,
    );
    await vscode.workspace.fs.writeFile(
      settingsUri,
      Buffer.from(settingsData, "utf-8"),
    );

    return true;
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to save settings: ${err.message}`);
    return false;
  }
}

/**
 * Shows the settings configuration form and saves the result
 * 
 * @param context - The VS Code extension context
 * @param currentEnvironments - Current array of environment mappings
 * @param currentDefaultEnvironment - Current default environment name
 * @returns Promise resolving to updated settings if saved, null if cancelled
 */
export async function showAndSaveSettingsForm(
  context: vscode.ExtensionContext,
  currentEnvironments: EnvironmentMapping[],
  currentDefaultEnvironment: string,
): Promise<{
  environments: EnvironmentMapping[];
  defaultEnvironment: string;
} | null> {
  const settings = await showConfigurationForm(context, {
    environments: currentEnvironments,
    defaultEnvironment: currentDefaultEnvironment,
  });

  if (settings) {
    const success = await saveSettingsToFile(
      context,
      settings.environments,
      settings.defaultEnvironment,
    );
    if (success) {
      return settings;
    }
  }
  return null;
}

/**
 * Gets the backend URL for a given environment
 * 
 * @param environment - The environment name
 * @param environments - Array of environment mappings
 * @returns The backend URL for the environment, or empty string if not found
 */
export function getBackendUrl(
  environment: string,
  environments: EnvironmentMapping[],
): string {
  const env = environments.find((e) => e.environment === environment);
  return env?.backendUrl || "";
}
