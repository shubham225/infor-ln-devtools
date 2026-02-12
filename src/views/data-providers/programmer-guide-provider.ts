import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export type GuideNode = {
  title: string;
  link?: string;
  children?: GuideNode[];
};

export class ProgrammerGuideProvider implements vscode.TreeDataProvider<GuideNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<GuideNode | undefined | void> =
    new vscode.EventEmitter<GuideNode | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<GuideNode | undefined | void> =
    this._onDidChangeTreeData.event;

  private contents: GuideNode[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.load();
  }

  refresh() {
    this.load();
    this._onDidChangeTreeData.fire();
  }

  private load() {
    // Load from static resources/programmer-guide/contents.json
    const contentsJsonPath = path.join(this.context.extensionPath, 'resources', 'programmer-guide', 'contents.json');
    try {
      if (fs.existsSync(contentsJsonPath)) {
        const contRaw = fs.readFileSync(contentsJsonPath, { encoding: 'utf8' });
        this.contents = JSON.parse(contRaw) as GuideNode[];
      } else {
        this.contents = [];
      }
    } catch (e) {
      this.contents = [];
    }
  }

  getTreeItem(element: GuideNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.title,
      element.children && element.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    if (element.link) {
      item.command = {
        command: "programmerGuide.open",
        title: "Open",
        arguments: [element.link],
      };
      item.contextValue = "page";
    }
    return item;
  }

  getChildren(element?: GuideNode): Thenable<GuideNode[]> {
    if (!element) {
      return Promise.resolve(this.contents);
    }
    return Promise.resolve(element.children || []);
  }
}
