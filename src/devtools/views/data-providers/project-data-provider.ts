import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { Project } from "../../types";

export class ProjectNode extends vscode.TreeItem {
  constructor(
    public readonly project: Project,
    public readonly isActive: boolean = false,
  ) {
    // Use label object to apply bold styling for active project
    super(project.name, vscode.TreeItemCollapsibleState.Collapsed);
    
    this.description = `${project.environment} | PMC: ${project.pmc}`;
    this.tooltip = `Project: ${project.name}\nEnvironment: ${project.environment}\nPMC: ${project.pmc}\nTicket: ${project.ticketId}\nVRC: ${project.vrc}\nRole: ${project.role}`;
    this.contextValue = "projectNode";
    
    // Highlight active project
    if (isActive) {
      this.iconPath = new vscode.ThemeIcon("folder-active", new vscode.ThemeColor("charts.green"));
      this.description = `${this.description} ✓ Active`;
    } else {
      this.iconPath = new vscode.ThemeIcon("folder");
    }
    
    // Set collapsible state to None initially - will expand only on double-click
    this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
  }
}

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
    const isBaanScript = parentFolderName === "Script" && fileName.endsWith(".bc");
    
    this.contextValue = isDirectory ? "fileFolder" : (isBaanScript ? "baanScript" : "file");
    this.resourceUri = vscode.Uri.file(filePath);
    
    if (!isDirectory) {
      // Check if JSON file in Table or Session folders
      const isTableJson = parentFolderName === "Table" && fileName.endsWith(".json");
      const isSessionJson = parentFolderName === "Session" && fileName.endsWith(".json");
      
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

export class ProjectDataProvider implements vscode.TreeDataProvider<ProjectNode | FileNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    ProjectNode | FileNode | undefined | null | void
  > = new vscode.EventEmitter<ProjectNode | FileNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ProjectNode | FileNode | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private projects: Project[] = [];
  private activeProjectName: string | null = null;
  private context: vscode.ExtensionContext;

  // Drag and drop controller
  public dragAndDropController: vscode.TreeDragAndDropController<ProjectNode | FileNode>;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadProjects();
    this.dragAndDropController = this.createDragAndDropController();
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
      return Promise.resolve(this.readDirectory(element.filePath, element.fileName));
    }

    return Promise.resolve([]);
  }

  private readDirectory(dirPath: string, parentFolderName?: string): FileNode[] {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      // Get current folder name if not provided
      const currentFolderName = parentFolderName || path.basename(dirPath);
      
      return entries
        .filter((entry) => !entry.name.startsWith('.')) // Filter hidden files
        .map((entry) => {
          const fullPath = path.join(dirPath, entry.name);
          return new FileNode(fullPath, entry.name, entry.isDirectory(), currentFolderName);
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

  /**
   * Check if a project folder has any files (excluding hidden files)
   */
  projectFolderHasFiles(projectName: string): boolean {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return false;
    }

    const projectFolder = path.join(
      workspaceFolder.uri.fsPath,
      "Development",
      projectName,
    );

    if (!fs.existsSync(projectFolder)) {
      return false;
    }

    try {
      const entries = fs.readdirSync(projectFolder, { withFileTypes: true });
      // Check if there are any non-hidden files or directories
      return entries.some((entry) => !entry.name.startsWith('.'));
    } catch (err) {
      console.error("Error checking project folder:", err);
      return false;
    }
  }

  private createDragAndDropController(): vscode.TreeDragAndDropController<ProjectNode | FileNode> {
    return {
      dropMimeTypes: ['application/vnd.code.tree.projectexplorer'],
      dragMimeTypes: ['application/vnd.code.tree.projectexplorer'],

      handleDrag: (source: readonly (ProjectNode | FileNode)[], dataTransfer: vscode.DataTransfer) => {
        // Only allow dragging ProjectNodes (not files)
        const projectNodes = source.filter(item => item instanceof ProjectNode) as ProjectNode[];
        if (projectNodes.length > 0) {
          dataTransfer.set(
            'application/vnd.code.tree.projectexplorer',
            new vscode.DataTransferItem(projectNodes.map(node => node.project))
          );
        }
      },

      handleDrop: async (target: ProjectNode | FileNode | undefined, dataTransfer: vscode.DataTransfer) => {
        const transferItem = dataTransfer.get('application/vnd.code.tree.projectexplorer');
        if (!transferItem) {
          return;
        }

        const draggedProjects = transferItem.value as Project[];
        if (!draggedProjects || draggedProjects.length === 0) {
          return;
        }

        // Find target index
        let targetIndex = this.projects.length;
        if (target instanceof ProjectNode) {
          targetIndex = this.projects.findIndex(p => p.name === target.project.name);
        }

        // Remove dragged projects from current positions
        const projectsToMove = draggedProjects.map(dp => {
          const index = this.projects.findIndex(p => p.name === dp.name);
          return { project: dp, oldIndex: index };
        }).filter(item => item.oldIndex >= 0);

        // Remove from old positions (in reverse order to maintain indices)
        projectsToMove.sort((a, b) => b.oldIndex - a.oldIndex);
        projectsToMove.forEach(item => {
          this.projects.splice(item.oldIndex, 1);
          // Adjust target index if we removed items before it
          if (item.oldIndex < targetIndex) {
            targetIndex--;
          }
        });

        // Insert at new position
        projectsToMove.reverse().forEach(item => {
          this.projects.splice(targetIndex, 0, item.project);
        });

        await this.saveProjects();
        this._onDidChangeTreeData.fire();
      }
    };
  }
}
