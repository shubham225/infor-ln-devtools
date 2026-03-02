import * as vscode from "vscode";

export class FileNode extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly fileName: string,
    public readonly isDirectory: boolean,
    public readonly parentFolderName?: string,
  ) {
    super(
      fileName,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    // Check if this is a .bc file in Script folder
    const isBaanScript =
      parentFolderName === "Script" && fileName.endsWith(".bc");

    this.contextValue = isDirectory
      ? "fileFolder"
      : isBaanScript
        ? "baanScript"
        : "file";
    this.resourceUri = vscode.Uri.file(filePath);

    if (!isDirectory) {
      // Check if JSON file in Table or Session folders
      const isTableJson =
        parentFolderName === "Table" && fileName.endsWith(".json");
      const isSessionJson =
        parentFolderName === "Session" && fileName.endsWith(".json");

      if (isTableJson) {
        this.command = {
          command: "project-explorer.openTableViewer",
          title: "Open Table Viewer",
          arguments: [vscode.Uri.file(filePath)],
        };
      } else if (isSessionJson) {
        this.command = {
          command: "project-explorer.openSessionViewer",
          title: "Open Session Viewer",
          arguments: [vscode.Uri.file(filePath)],
        };
      } else {
        // Open with default editor - VS Code will auto-detect language
        this.command = {
          command: "project-explorer.openFile",
          title: "Open File",
          arguments: [vscode.Uri.file(filePath)],
        };
      }
    }
  }
}