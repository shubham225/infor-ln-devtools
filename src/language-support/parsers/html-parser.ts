import * as fs from "fs";
import * as path from "path";
import { FunctionDoc } from "../types";

export class HtmlDocParser {
  private functionDocs: Map<string, FunctionDoc> = new Map();

  /**
   * Parse HTML file to extract function documentation
   */
  parseHtmlFile(filePath: string, category: string): FunctionDoc | null {
    try {
      const content = fs.readFileSync(filePath, "utf-8");

      // Extract function name from title
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      if (!titleMatch) {
        return null;
      }

      const functionName = titleMatch[1].replace(/\(\)/g, "").trim();

      // Extract syntax
      const syntaxMatch = content.match(
        /<div class="subSectionTitle">Syntax:<\/div>\s*<p class="Paragraph"><code>([\s\S]*?)<\/code><\/p>/i,
      );
      const syntax = syntaxMatch
        ? this.cleanHtml(syntaxMatch[1])
        : "No syntax available";

      // Extract description
      const descMatch = content.match(
        /<div class="subSectionTitle">Description<\/div>\s*<p class="Paragraph">([\s\S]*?)<\/p>/i,
      );
      const description = descMatch
        ? this.cleanHtml(descMatch[1])
        : "No description available";

      // Extract arguments
      const args: Array<{ type: string; name: string; description: string }> =
        [];
      const argsMatch = content.match(
        /<div class="subSectionTitle">Arguments<\/div>([\s\S]*?)<\/table>/i,
      );
      if (argsMatch) {
        const argRows = argsMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
        for (const row of argRows) {
          const cells = row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
          const cellArray = Array.from(cells);
          if (cellArray.length >= 3) {
            args.push({
              type: this.cleanHtml(cellArray[0][1]),
              name: this.cleanHtml(cellArray[1][1]),
              description: this.cleanHtml(cellArray[2][1]),
            });
          }
        }
      }

      // Extract return value
      const returnMatch = content.match(
        /<div class="subSectionTitle">Return values?<\/div>\s*<p class="Paragraph">([\s\S]*?)<\/p>/i,
      );
      const returnValue = returnMatch
        ? this.cleanHtml(returnMatch[1])
        : "No return value documentation";

      return {
        name: functionName,
        syntax,
        description,
        arguments: args,
        returnValue,
        category,
      };
    } catch (error) {
      console.error(`Error parsing ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Clean HTML tags and entities from text
   */
  private cleanHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Parse index file to get all function references
   */
  parseIndexFile(indexPath: string): Map<string, string> {
    const functionMap = new Map<string, string>();

    try {
      const content = fs.readFileSync(indexPath, "utf-8");

      // Extract function entries from index
      const entries = content.matchAll(
        /<param name="Name" value="([^"]+)"[^>]*><param name="Local" value="([^"]+)"/gi,
      );

      for (const entry of entries) {
        const functionName = entry[1].trim();
        const localPath = entry[2];

        // Only include actual function entries (not section headings)
        if (localPath.includes("functions_")) {
          functionMap.set(functionName.toLowerCase(), localPath);
        }
      }
    } catch (error) {
      console.error(`Error parsing index file:`, error);
    }

    return functionMap;
  }

  /**
   * Build complete function documentation database
   */
  buildFunctionDatabase(progGuidePath: string): Map<string, FunctionDoc> {
    const indexPath = path.join(progGuidePath, "progguide_index.hhk");
    const functionMap = this.parseIndexFile(indexPath);

    console.log(`Found ${functionMap.size} functions in index`);

    for (const [funcName, relativePath] of functionMap) {
      const fullPath = path.join(progGuidePath, relativePath);

      if (fs.existsSync(fullPath)) {
        // Extract category from path
        const category = relativePath.split("/")[1] || "unknown";

        const doc = this.parseHtmlFile(fullPath, category);
        if (doc) {
          this.functionDocs.set(funcName, doc);
        }
      }
    }

    console.log(
      `Parsed ${this.functionDocs.size} function documentation entries`,
    );
    return this.functionDocs;
  }

  /**
   * Get function documentation by name (case-insensitive)
   */
  getFunctionDoc(functionName: string): FunctionDoc | undefined {
    return this.functionDocs.get(functionName.toLowerCase());
  }

  /**
   * Get all function names for completion
   */
  getAllFunctionNames(): string[] {
    return Array.from(this.functionDocs.keys());
  }

  /**
   * Save parsed documentation to JSON file for faster loading
   */
  saveToJson(outputPath: string): void {
    const data: Array<[string, FunctionDoc]> = Array.from(
      this.functionDocs.entries(),
    );
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`Saved function database to ${outputPath}`);
  }

  /**
   * Load parsed documentation from JSON file
   */
  loadFromJson(inputPath: string): boolean {
    try {
      const content = fs.readFileSync(inputPath, "utf-8");
      const data: Array<[string, FunctionDoc]> = JSON.parse(content);
      this.functionDocs = new Map(data);
      console.log(`Loaded ${this.functionDocs.size} function docs from cache`);
      return true;
    } catch (error) {
      console.error(`Error loading function database:`, error);
      return false;
    }
  }
}
