import * as vscode from "vscode";
import { FunctionDocDatabase } from "./function-doc-database";
import { BaanCHoverProvider } from "./providers/hover-provider";
import { BaanCCompletionProvider } from "./providers/completion-provider";
import { BaanCDefinitionProvider } from "./providers/definition-provider";
import { BaanCSignatureHelpProvider } from "./providers/signature-help-provider";

// Document selector for BaanC language. Do not restrict by scheme so
// editors that use alternate URI schemes (like Cursor) still match.
const BAANC_LANGUAGE: vscode.DocumentSelector = { language: "baanc" };

/**
 * Initialize BaanC language support (non-blocking)
 * Initializes in the background to not slow down extension activation
 */
export function initializeLanguageSupport(
  context: vscode.ExtensionContext,
): void {
  console.log("Starting BaanC language support initialization...");

  // Initialize asynchronously without blocking extension activation
  initializeAsync(context).catch((error) => {
    console.error("Error initializing BaanC language support:", error);
    vscode.window.showErrorMessage(
      "BaanC Language Support: Initialization failed. Some features may not work.",
    );
  });
}

/**
 * Async initialization (runs in background)
 */
async function initializeAsync(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Apply initial configuration (quick, non-blocking)
  applyInitialConfig().catch((err) =>
    console.error("Error applying BaanC config:", err),
  );

  // Initialize function documentation database
  const docDatabase = new FunctionDocDatabase(context.extensionPath);

  // Register language providers immediately (they work without the database)
  registerLanguageProviders(context, docDatabase);
  console.log("BaanC language providers registered");

  // Load function database in background
  await docDatabase.initialize();

  // Log statistics
  const stats = docDatabase.getStats();
  console.log(
    `BaanC Database Stats: ${stats.functions} functions, ${stats.keywords} keywords, ${stats.variables} variables`,
  );

  console.log("BaanC language support fully initialized");
}

/**
 * Register all language providers
 */
function registerLanguageProviders(
  context: vscode.ExtensionContext,
  docDatabase: FunctionDocDatabase,
): void {
  // Hover provider - shows documentation on hover
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      BAANC_LANGUAGE,
      new BaanCHoverProvider(docDatabase),
    ),
  );

  // Completion provider - provides IntelliSense suggestions
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      BAANC_LANGUAGE,
      new BaanCCompletionProvider(docDatabase),
      ".", // Trigger on dot for namespaced functions
    ),
  );

  // Definition provider - enables go-to-definition
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      BAANC_LANGUAGE,
      new BaanCDefinitionProvider(),
    ),
  );

  // Signature help provider - shows parameter hints
  context.subscriptions.push(
    vscode.languages.registerSignatureHelpProvider(
      BAANC_LANGUAGE,
      new BaanCSignatureHelpProvider(docDatabase),
      "(", // Trigger on opening parenthesis
      ",", // Trigger on comma for next parameter
    ),
  );
}

/**
 * Apply initial configuration for BaanC editor settings (non-blocking)
 */
async function applyInitialConfig(): Promise<void> {
  const boolKey = "baanc.initialConfigApplied";
  const config = vscode.workspace.getConfiguration();
  const initialConfigComplete = config.get<boolean>(boolKey);

  if (!initialConfigComplete) {
    try {
      // Set BaanC-specific editor settings
      const section = "[baanc]";
      const currentConfig = config.get(section) || {};

      const updatedConfig = {
        ...currentConfig,
        "editor.insertSpaces": false, // Use tabs, not spaces
        "editor.detectIndentation": false,
        "editor.tabSize": 8, // BaanC standard tab size
        "editor.wordSeparators": "`~!@#%^&*()-=+[{]}\\|;:'\",<>/?",
        "editor.rulers": [80], // Show ruler at 80 characters
      };

      await config.update(
        section,
        updatedConfig,
        vscode.ConfigurationTarget.Global,
      );

      await config.update(boolKey, true, vscode.ConfigurationTarget.Global);

      console.log("BaanC initial configuration applied");
    } catch (error) {
      console.error("Error applying BaanC initial configuration:", error);
    }
  }
}
