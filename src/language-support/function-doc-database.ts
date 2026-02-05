import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export interface FunctionDoc {
  name: string;
  syntax: string;
  description: string;
  arguments: Array<{ type: string; name: string; description: string }>;
  returnValue: string;
  category: string;
}

/**
 * Manages the function documentation database
 * Uses a pre-built compact JSON format for optimal performance
 */
export class FunctionDocDatabase {
  private functionDocs: Map<string, FunctionDoc> = new Map();
  private isLoaded: boolean = false; // indicates index (names) is available
  private fullDbLoaded: boolean = false; // indicates full DB has been parsed

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Initialize the function documentation database
   * Loads from compact JSON format in resources
   */
  async initialize(): Promise<void> {
    const compactDbPath = path.join(
      this.context.extensionPath,
      "resources",
      "baanc-functions-compact.json",
    );
    const indexPath = path.join(
      this.context.extensionPath,
      "resources",
      "baanc-functions-index.json",
    );

    try {
      // Prefer loading a small index first for fast startup
      if (fs.existsSync(indexPath)) {
        const idxContent = fs.readFileSync(indexPath, "utf-8");
        const entries = JSON.parse(idxContent) as Array<any>;
        for (const e of entries) {
          const name = (e.name || "").toString();
          const doc: FunctionDoc = {
            name,
            syntax: e.syntax || "",
            description: e.short || "",
            arguments: [],
            returnValue: "void",
            category: e.category || "general",
          };
          this.functionDocs.set(name.toLowerCase(), doc);
        }

        this.isLoaded = true;
        console.log(
          `BaanC: Loaded function index with ${this.functionDocs.size} entries`,
        );

        // Load the full DB asynchronously in background to enrich docs
        this.loadFullDbAsync(compactDbPath).catch((err) => {
          console.error('Background full DB load failed:', err);
        });
      } else if (fs.existsSync(compactDbPath)) {
        // Fallback: parse full DB synchronously if no index available
        const content = fs.readFileSync(compactDbPath, "utf-8");
        const data = JSON.parse(content);

        // Convert compact format to full FunctionDoc format
        if (data && typeof data === 'object' && !Array.isArray(data) && data.functions) {
          for (const [funcName, funcInfo] of Object.entries(data.functions)) {
            const info = funcInfo as any;
            const doc: FunctionDoc = {
              name: funcName,
              syntax: info.syntax || "",
              description: info.description || "",
              arguments: (info.params || []).map((p: any) => ({
                type: p.type || "void",
                name: p.name || "",
                description: p.desc || "",
              })),
              returnValue: info.returns || "void",
              category: info.category || "general",
            };

            this.functionDocs.set(funcName.toLowerCase(), doc);
          }

          this.isLoaded = true;
          this.fullDbLoaded = true;
          console.log(`BaanC: Loaded ${this.functionDocs.size} built-in functions`);
        } else if (Array.isArray(data)) {
          for (const item of data) {
            if (Array.isArray(item) && item.length >= 2 && typeof item[0] === 'string') {
              const funcName = item[0];
              const info = item[1] || {};
              const doc: FunctionDoc = {
                name: funcName,
                syntax: info.syntax || "",
                description: info.description || "",
                arguments: (info.params || []).map((p: any) => ({
                  type: p.type || "void",
                  name: p.name || "",
                  description: p.desc || "",
                })),
                returnValue: info.returns || "void",
                category: info.category || "general",
              };
              this.functionDocs.set(funcName.toLowerCase(), doc);
            }
          }

          this.isLoaded = true;
          this.fullDbLoaded = true;
          console.log(`BaanC: Loaded ${this.functionDocs.size} built-in functions`);
        }
      } else {
        console.warn(`Function database not found: ${compactDbPath}`);
        vscode.window.showWarningMessage(
          "BaanC: Function database not found. IntelliSense will be limited to keywords only.",
        );
      }
    } catch (error) {
      console.error("Error loading function database:", error);
      vscode.window.showErrorMessage(
        "BaanC: Failed to load function database. IntelliSense may be limited.",
      );
    }
  }

  /**
   * Background load of full compact DB to enrich previously-loaded index entries
   */
  private async loadFullDbAsync(compactDbPath: string): Promise<void> {
    if (!fs.existsSync(compactDbPath)) {
      return;
    }

    try {
      const content = await fs.promises.readFile(compactDbPath, 'utf8');
      const data = JSON.parse(content);

      if (data && typeof data === 'object' && !Array.isArray(data) && data.functions) {
        for (const [funcName, funcInfo] of Object.entries(data.functions)) {
          const info = funcInfo as any;
          const doc: FunctionDoc = {
            name: funcName,
            syntax: info.syntax || "",
            description: info.description || "",
            arguments: (info.params || []).map((p: any) => ({
              type: p.type || "void",
              name: p.name || "",
              description: p.desc || "",
            })),
            returnValue: info.returns || "void",
            category: info.category || "general",
          };

          this.functionDocs.set(funcName.toLowerCase(), doc);
        }
      } else if (Array.isArray(data)) {
        for (const item of data) {
          if (Array.isArray(item) && item.length >= 2 && typeof item[0] === 'string') {
            const funcName = item[0];
            const info = item[1] || {};
            const doc: FunctionDoc = {
              name: funcName,
              syntax: info.syntax || "",
              description: info.description || "",
              arguments: (info.params || []).map((p: any) => ({
                type: p.type || "void",
                name: p.name || "",
                description: p.desc || "",
              })),
              returnValue: info.returns || "void",
              category: info.category || "general",
            };

            this.functionDocs.set(funcName.toLowerCase(), doc);
          }
        }
      }

      this.fullDbLoaded = true;
      console.log('BaanC: Full function DB loaded in background');
    } catch (err) {
      console.error('Error loading full function DB:', err);
    }
  }

  /**
   * Get function documentation by name (case-insensitive)
   */
  getFunctionDoc(functionName: string): FunctionDoc | undefined {
    if (!this.isLoaded) {
      return undefined;
    }
    return this.functionDocs.get(functionName.toLowerCase());
  }

  /**
   * Get all function names for completion
   */
  getAllFunctionNames(): string[] {
    if (!this.isLoaded) {
      return [];
    }
    return Array.from(this.functionDocs.keys());
  }

  /**
   * Check if database is loaded
   */
  get loaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Add custom function documentation (for DLL functions, etc.)
   */
  addCustomFunction(doc: FunctionDoc): void {
    this.functionDocs.set(doc.name.toLowerCase(), doc);
  }

  /**
   * Search functions by category
   */
  getFunctionsByCategory(category: string): FunctionDoc[] {
    return Array.from(this.functionDocs.values()).filter(
      (doc) => doc.category === category,
    );
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const doc of this.functionDocs.values()) {
      categories.add(doc.category);
    }
    return Array.from(categories);
  }
}
