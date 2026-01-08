import * as vscode from "vscode";
import axios from "axios";
import { TablesDataProvider, TreeNode } from "./tables-data-provider";

export async function refreshTablesView(dataProvider: TablesDataProvider) {
  const result = await axios.get("http://localhost:3000/tables");
  const data = result.data;

  const grouped: Record<string, Record<string, any[]>> = {};

  for (const item of data) {
    const pkg = item.package;
    const mod = item.module;

    if (!grouped[pkg]) grouped[pkg] = {};
    if (!grouped[pkg][mod]) grouped[pkg][mod] = [];

    grouped[pkg][mod].push(item);
  }

  const tree = Object.entries(grouped).map(
    ([pkg, modules]) =>
      new TreeNode(
        pkg,
        vscode.TreeItemCollapsibleState.Collapsed,
        Object.entries(modules).map(
          ([mod, items]) =>
            new TreeNode(
              mod,
              vscode.TreeItemCollapsibleState.Collapsed,
              items.map(
                (item: any) =>
                  new TreeNode(
                    `${item.package}${item.module}${item.code}`, 
                    vscode.TreeItemCollapsibleState.None
                  )
              )
            )
        )
      )
  );

  dataProvider.refresh(tree);
}
