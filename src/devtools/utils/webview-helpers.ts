import * as vscode from "vscode";

/**
 * Get a local resource URI for use in webview
 */
export function getLocalResource(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  pathList: string[],
): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}
