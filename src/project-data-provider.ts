import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export interface Project {
  name: string;
  pmc: string;
  jiraId: string;
  vrc: string;
  role: "Developer" | "Reviewer";
  createdAt: number;
}

export class ProjectNode extends vscode.TreeItem {
  constructor(
    public readonly project: Project,
    public readonly isActive: boolean = false,
  ) {
    super(project.name, vscode.TreeItemCollapsibleState.Collapsed);
    
    this.description = `PMC: ${project.pmc} | ${project.role}`;
    this.tooltip = `Project: ${project.name}\nPMC: ${project.pmc}\nJIRA: ${project.jiraId}\nVRC: ${project.vrc}\nRole: ${project.role}`;
    this.contextValue = "projectNode";
    
    // Highlight active project
    if (isActive) {
      this.iconPath = new vscode.ThemeIcon("folder-opened", new vscode.ThemeColor("charts.green"));
      this.description = `${this.description} ✓ Active`;
    } else {
      this.iconPath = new vscode.ThemeIcon("folder");
    }
  }
}

export class FileNode extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly fileName: string,
    public readonly isDirectory: boolean,
  ) {
    super(
      fileName,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    
    this.contextValue = isDirectory ? "fileFolder" : "file";
    this.resourceUri = vscode.Uri.file(filePath);
    
    if (!isDirectory) {
      this.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [vscode.Uri.file(filePath)],
      };
    }
  }
}

export class ProjectDataProvider implements vscode.TreeDataProvider<ProjectNode | FileNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    ProjectNode | FileNode | undefined | null | void
  > = new vscode.EventEmitter<ProjectNode | FileNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ProjectNode | FileNode | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private projects: Project[] = [];
  private activeProjectName: string | null = null;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadProjects();
  }

  private loadProjects() {
    const savedProjects = this.context.globalState.get<Project[]>("projects", []);
    this.projects = savedProjects;
    this.activeProjectName = this.context.globalState.get<string | null>("activeProject", null);
  }

  private async saveProjects() {
    await this.context.globalState.update("projects", this.projects);
    await this.context.globalState.update("activeProject", this.activeProjectName);
  }

  refresh() {
    this.loadProjects();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ProjectNode | FileNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ProjectNode | FileNode): Thenable<(ProjectNode | FileNode)[]> {
    if (!element) {
      // Root level - return all projects
      const nodes = this.projects.map(
        (project) => new ProjectNode(project, project.name === this.activeProjectName)
      );
      return Promise.resolve(nodes);
    }

    // If element is a ProjectNode, return its folder contents
    if (element instanceof ProjectNode) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return Promise.resolve([]);
      }

      const projectFolder = path.join(
        workspaceFolder.uri.fsPath,
        "Development",
        element.project.name,
      );

      if (!fs.existsSync(projectFolder)) {
        return Promise.resolve([]);
      }

      return Promise.resolve(this.readDirectory(projectFolder));
    }

    // If element is a FileNode and it's a directory, return its contents
    if (element instanceof FileNode && element.isDirectory) {
      return Promise.resolve(this.readDirectory(element.filePath));
    }

    return Promise.resolve([]);
  }

  private readDirectory(dirPath: string): FileNode[] {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      return entries
        .filter((entry) => !entry.name.startsWith('.')) // Filter hidden files
        .map((entry) => {
          const fullPath = path.join(dirPath, entry.name);
          return new FileNode(fullPath, entry.name, entry.isDirectory());
        })
        .sort((a, b) => {
          // Directories first, then files
          if (a.isDirectory && !b.isDirectory) {
            return -1;
          }
          if (!a.isDirectory && b.isDirectory) {
            return 1;
          }
          return a.fileName.localeCompare(b.fileName);
        });
    } catch (err) {
      console.error("Error reading directory:", err);
      return [];
    }
  }

  async addProject(project: Project): Promise<void> {
    // Check if project with same name exists
    const exists = this.projects.some((p) => p.name === project.name);
    if (exists) {
      throw new Error(`Project "${project.name}" already exists`);
    }

    this.projects.push(project);
    await this.saveProjects();
    this._onDidChangeTreeData.fire();
  }

  async updateProject(oldName: string, project: Project): Promise<void> {
    const index = this.projects.findIndex((p) => p.name === oldName);
    if (index === -1) {
      throw new Error(`Project "${oldName}" not found`);
    }

    // Check if new name conflicts with another project
    if (oldName !== project.name) {
      const nameExists = this.projects.some((p) => p.name === project.name);
      if (nameExists) {
        throw new Error(`Project "${project.name}" already exists`);
      }
    }

    this.projects[index] = project;
    
    // Update active project name if it was renamed
    if (this.activeProjectName === oldName) {
      this.activeProjectName = project.name;
    }

    await this.saveProjects();
    this._onDidChangeTreeData.fire();
  }

  async removeProject(projectName: string): Promise<void> {
    this.projects = this.projects.filter((p) => p.name !== projectName);
    
    // Clear active project if it was removed
    if (this.activeProjectName === projectName) {
      this.activeProjectName = null;
    }

    await this.saveProjects();
    this._onDidChangeTreeData.fire();
  }

  async setActiveProject(projectName: string): Promise<void> {
    const project = this.projects.find((p) => p.name === projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }

    this.activeProjectName = projectName;
    await this.saveProjects();
    this._onDidChangeTreeData.fire();
  }

  getActiveProject(): Project | null {
    if (!this.activeProjectName) {
      return null;
    }
    return this.projects.find((p) => p.name === this.activeProjectName) || null;
  }

  getProject(projectName: string): Project | undefined {
    return this.projects.find((p) => p.name === projectName);
  }

  getAllProjects(): Project[] {
    return [...this.projects];
  }
}
