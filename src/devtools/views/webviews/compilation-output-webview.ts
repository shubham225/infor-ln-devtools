import * as vscode from "vscode";
import { getLocalResource } from "../../utils/webview-helpers";

interface CompilationResult {
  script: string;
  success: boolean;
  output: string;
}

export function showCompilationOutput(
  context: vscode.ExtensionContext,
  result: CompilationResult,
): void {
  // Use unique key for each script to avoid overwriting
  const panelKey = `compilation:${result.script}:${Date.now()}`;

  const panel = vscode.window.createWebviewPanel(
    "compilationOutput",
    `Compilation: ${result.script}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      enableFindWidget: true,
    },
  );

  const lucideUri = getLocalResource(panel.webview, context.extensionUri, [
    "resources",
    "lucide.min.js",
  ]);

  panel.webview.html = getCompilationOutputHtml(result, lucideUri);
}

function getCompilationOutputHtml(
  result: CompilationResult,
  lucideUri: vscode.Uri,
): string {
  const statusIcon = result.success ? "check-circle" : "x-circle";
  const statusColor = result.success
    ? "var(--vscode-testing-iconPassed)"
    : "var(--vscode-testing-iconFailed)";
  const statusTitle = result.success
    ? "Compilation Successful"
    : "Compilation Error";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="${lucideUri}"></script>
    <style>
        :root {
            --radius: 6px;
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-foreground);
            --border: var(--vscode-panel-border);
            --font: var(--vscode-font-family, 'Inter', sans-serif);
        }

        body {
            font-family: var(--font);
            background-color: var(--bg);
            color: var(--fg);
            margin: 0;
            padding: 20px;
        }

        .container {
            max-width: 100%;
            margin: 0 auto;
        }

        .header {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 20px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .status-icon {
            width: 48px;
            height: 48px;
            color: ${statusColor};
        }

        .header-content {
            flex: 1;
        }

        .header h1 {
            margin: 0 0 8px 0;
            font-size: 24px;
            font-weight: 600;
        }

        .header .script-name {
            font-family: 'Consolas', 'Courier New', monospace;
            opacity: 0.7;
            font-size: 14px;
        }

        .output-container {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 16px;
        }

        .output-title {
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            opacity: 0.7;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .output-content {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 12px;
            white-space: pre-wrap;
            word-wrap: break-word;
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            line-height: 1.6;
            max-height: 600px;
            overflow-y: auto;
        }

        .output-content:empty::before {
            content: 'No compilation output';
            opacity: 0.5;
            font-style: italic;
        }

        .warning-line {
            color: var(--vscode-editorWarning-foreground);
        }

        .error-line {
            color: var(--vscode-editorError-foreground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <i data-lucide="${statusIcon}" class="status-icon"></i>
            <div class="header-content">
                <h1>${statusTitle}</h1>
                <div class="script-name">${result.script}</div>
            </div>
        </div>

        <div class="output-container">
            <div class="output-title">
                <i data-lucide="terminal" style="width:16px;height:16px;"></i>
                Compilation Output
            </div>
            <div class="output-content" id="outputContent">${escapeHtml(result.output)}</div>
        </div>
    </div>

    <script>
        lucide.createIcons();
        
        const outputContent = document.getElementById('outputContent');
        const originalContent = outputContent.textContent;

        // Highlight warnings and errors
        function formatOutput() {
            const lines = originalContent.split('\\n');
            const formatted = lines.map(line => {
                if (line.toLowerCase().includes('warning:')) {
                    return \`<span class="warning-line">\${line}</span>\`;
                } else if (line.toLowerCase().includes('error:')) {
                    return \`<span class="error-line">\${line}</span>\`;
                }
                return line;
            }).join('\\n');
            outputContent.innerHTML = formatted;
        }

        formatOutput();
    </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}
