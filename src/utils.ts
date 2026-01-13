import * as vscode from "vscode";

export function getServerUrl(context: vscode.ExtensionContext): string | undefined {
  return context.globalState.get<string>("serverUrl");
}