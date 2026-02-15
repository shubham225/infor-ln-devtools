import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

let currentPanel: vscode.WebviewPanel | null = null;

export function openPageInWebview(context: vscode.ExtensionContext, relativePath: string) {
  const baseDir = path.join(context.extensionPath, 'resources', 'programmer-guide');
  const filePath = path.join(baseDir, relativePath.replace(/^[\\/]+/, ''));

  if (!fs.existsSync(filePath)) {
    vscode.window.showErrorMessage(`File not found: ${relativePath}`);
    return;
  }

  let html = fs.readFileSync(filePath, { encoding: 'utf8' });

  // Rewrite src and href attributes to webview URIs
  html = html.replace(/(src|href)=("|')([^"'>]+)("|')/gi, (m, attr, q, url) => {
    if (/^(https?:|data:|file:|\#|mailto:)/i.test(url)) {
      return m;
    }
    const resourcePath = path.join(path.dirname(filePath), url);
    if (!fs.existsSync(resourcePath)) {
      return m;
    }
    if (!currentPanel || !currentPanel.webview) {
      return m;
    }
    const uri = currentPanel.webview.asWebviewUri(vscode.Uri.file(resourcePath)).toString();
    return `${attr}=${q}${uri}${q}`;
  });

  // Create or reuse panel
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
  } else {
    currentPanel = vscode.window.createWebviewPanel(
      'programmerGuidePage',
      'Programmer Guide',
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(baseDir, 'progguide')),
          vscode.Uri.file(path.join(baseDir, 'skin')),
        ],
      },
    );
    currentPanel.onDidDispose(() => {
      currentPanel = null;
    });
  }

  currentPanel.webview.html = html;
}


