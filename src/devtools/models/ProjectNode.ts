import * as vscode from "vscode";
import { Project } from "../types";

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
      this.iconPath = new vscode.ThemeIcon(
        "folder-active",
        new vscode.ThemeColor("charts.green"),
      );
      this.description = `${this.description} ✓ Active`;
    } else {
      this.iconPath = new vscode.ThemeIcon("folder");
    }

    // Set collapsible state to None initially - will expand only on double-click
    this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
  }
}