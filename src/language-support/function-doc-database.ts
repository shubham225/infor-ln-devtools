import * as path from "path";
import * as fs from "fs";

export interface FunctionDoc {
  name: string;
  type: 'function' | 'keyword' | 'variable' | 'concept';
  syntax?: string;
  description: string;
  arguments?: Array<{ type: string; name: string; description: string }>;
  returnValue?: string;
  category: string;
  dataType?: string;  // For variables
  attributes?: string;  // For variables
  context?: string;  // For keywords/concepts
}

/**
 * Manages the comprehensive BaanC documentation database
 * Includes functions, keywords, variables, and 3GL concepts
 */
export class FunctionDocDatabase {
  private functionDocs: Map<string, FunctionDoc> = new Map();
  private keywordDocs: Map<string, FunctionDoc> = new Map();
  private searchIndex: any = null;
  private isLoaded: boolean = false;

  constructor(private extensionPath: string) {}

  /**
   * Initialize the documentation database
   * Loads from resources/language-data directory
   */
  async initialize(): Promise<void> {
    const dataDir = path.join(
      this.extensionPath,
      "src",
      "language-support",
      "data",
    );

    console.log(`BaanC: Looking for language data in: ${dataDir}`);

    try {
      // Load functions
      const functionsPath = path.join(dataDir, "baanc-functions.json");
      console.log(`BaanC: Checking functions file: ${functionsPath}`);
      if (fs.existsSync(functionsPath)) {
        const functionsContent = fs.readFileSync(functionsPath, "utf-8");
        const functionsData = JSON.parse(functionsContent);
        
        for (const [name, doc] of Object.entries(functionsData)) {
          this.functionDocs.set(name.toLowerCase(), doc as FunctionDoc);
        }
        console.log(`BaanC: Loaded ${this.functionDocs.size} functions`);
      } else {
        console.warn(`BaanC: Functions file not found at ${functionsPath}`);
      }

      // Load keywords and variables
      const keywordsPath = path.join(dataDir, "baanc-keywords.json");
      console.log(`BaanC: Checking keywords file: ${keywordsPath}`);
      if (fs.existsSync(keywordsPath)) {
        const keywordsContent = fs.readFileSync(keywordsPath, "utf-8");
        const keywordsData = JSON.parse(keywordsContent);
        
        for (const [name, doc] of Object.entries(keywordsData)) {
          this.keywordDocs.set(name.toLowerCase(), doc as FunctionDoc);
        }
        console.log(`BaanC: Loaded ${this.keywordDocs.size} keywords/variables`);
      } else {
        console.warn(`BaanC: Keywords file not found at ${keywordsPath}`);
      }

      // Load search index
      const indexPath = path.join(dataDir, "baanc-search-index.json");
      console.log(`BaanC: Checking search index file: ${indexPath}`);
      if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, "utf-8");
        this.searchIndex = JSON.parse(indexContent);
        console.log(`BaanC: Search index loaded`);
      } else {
        console.warn(`BaanC: Search index file not found at ${indexPath}`);
      }

      // If no data was loaded, try fallback
      if (this.functionDocs.size === 0 && this.keywordDocs.size === 0) {
        console.log("BaanC: No data loaded, trying fallback...");
        await this.loadFromResources();
      } else {
        this.isLoaded = true;
        // Log summary
        console.log(`BaanC Language Support: ${this.functionDocs.size + this.keywordDocs.size} items loaded`);
      }
    } catch (error) {
      console.error("Error loading BaanC documentation database:", error);
      
      // Fallback: try to load from old location (resources folder)
      await this.loadFromResources();
    }
  }

  /**
   * Fallback: Load from resources folder if data folder doesn't exist
   */
  private async loadFromResources(): Promise<void> {
    console.log("Attempting to load from resources folder...");
    
    const resourcesPath = path.join(
      this.extensionPath,
      "resources",
      "baanc-functions-compact.json",
    );

    console.log(`BaanC: Checking fallback resources at: ${resourcesPath}`);

    try {
      if (fs.existsSync(resourcesPath)) {
        const content = fs.readFileSync(resourcesPath, "utf-8");
        const data = JSON.parse(content);

        // Convert old format to new format
        if (data.functions) {
          for (const [funcName, funcInfo] of Object.entries(data.functions)) {
            const info = funcInfo as any;
            const doc: FunctionDoc = {
              name: funcName,
              type: 'function',
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
          console.log(`BaanC: Loaded ${this.functionDocs.size} functions from resources (fallback)`);
        }
      } else {
        console.warn(`BaanC: Fallback resources file not found at ${resourcesPath}`);
      }
    } catch (error) {
      console.error("Error loading from resources:", error);
    }
  }

  /**
   * Get documentation by name (case-insensitive)
   * Searches both functions and keywords
   */
  getDoc(name: string): FunctionDoc | undefined {
    if (!this.isLoaded) {
      return undefined;
    }

    const lowerName = name.toLowerCase();
    
    // Try functions first
    let doc = this.functionDocs.get(lowerName);
    if (doc) {
      return doc;
    }

    // Try keywords/variables
    return this.keywordDocs.get(lowerName);
  }

  /**
   * Get function documentation by name
   */
  getFunctionDoc(functionName: string): FunctionDoc | undefined {
    if (!this.isLoaded) {
      return undefined;
    }
    return this.functionDocs.get(functionName.toLowerCase());
  }

  /**
   * Get keyword/variable documentation by name
   */
  getKeywordDoc(keywordName: string): FunctionDoc | undefined {
    if (!this.isLoaded) {
      return undefined;
    }
    return this.keywordDocs.get(keywordName.toLowerCase());
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
   * Get all keyword/variable names for completion
   */
  getAllKeywordNames(): string[] {
    if (!this.isLoaded) {
      return [];
    }
    return Array.from(this.keywordDocs.keys());
  }

  /**
   * Get all documentation items (functions + keywords)
   */
  getAllDocs(): FunctionDoc[] {
    if (!this.isLoaded) {
      return [];
    }
    return [
      ...Array.from(this.functionDocs.values()),
      ...Array.from(this.keywordDocs.values()),
    ];
  }

  /**
   * Search by category using index
   */
  getByCategory(category: string): string[] {
    if (!this.searchIndex || !this.searchIndex.byCategory) {
      return [];
    }
    return this.searchIndex.byCategory[category] || [];
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    if (!this.searchIndex || !this.searchIndex.byCategory) {
      return [];
    }
    return Object.keys(this.searchIndex.byCategory);
  }

  /**
   * Check if database is loaded
   */
  get loaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Add custom documentation (for DLL functions, etc.)
   */
  addCustomDoc(doc: FunctionDoc): void {
    if (doc.type === 'function') {
      this.functionDocs.set(doc.name.toLowerCase(), doc);
    } else {
      this.keywordDocs.set(doc.name.toLowerCase(), doc);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    functions: number;
    keywords: number;
    variables: number;
    total: number;
  } {
    const variables = Array.from(this.keywordDocs.values()).filter(
      (d) => d.type === "variable",
    ).length;
    const keywords = Array.from(this.keywordDocs.values()).filter(
      (d) => d.type === "keyword",
    ).length;

    return {
      functions: this.functionDocs.size,
      keywords: keywords,
      variables: variables,
      total: this.functionDocs.size + this.keywordDocs.size,
    };
  }
}
