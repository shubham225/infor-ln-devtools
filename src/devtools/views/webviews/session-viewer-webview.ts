import * as vscode from "vscode";
import { getLocalResource } from "../../utils/webview-helpers";

interface SessionData {
  session: string;
  sessionDescription: string;
  programScript: string;
  mainTable: string;
  sessionType: string;
  startCommand: number;
  windowType: string;
  sessionForm: {
    enabledStandardCommands: string[];
    sessionForm: string;
    formFields: Array<{
      sequence: number;
      fieldName: string;
      fieldLabel?: string;
      fieldType: string;
      zoomType?: string;
      zoomToProgram?: string;
      zoomReturnField?: string;
      domain?: string;
      datatype?: string;
      enumDescr?: string;
      enumDomainData?: Array<{
        constant: string;
        description: string;
      }>;
    }>;
    formCommands: Array<{
      serialNumber: number;
      commandType: string;
      activateA: string;
      "Name of Session/Function/Method": string;
      description: string;
      button: string;
      sortSequence: number;
      commandAvailability: string;
      detail: string;
      parentMenu: number;
      sessionStartMode: string;
      kindOfSession: string;
    }>;
  };
}

// Store for open session viewer panels
const openSessionPanels = new Map<string, vscode.WebviewPanel>();

export function showSessionViewer(
  context: vscode.ExtensionContext,
  sessionData: SessionData,
): void {
  const panelKey = `session:${sessionData.session}`;

  // Check if panel already exists
  const existingPanel = openSessionPanels.get(panelKey);
  if (existingPanel) {
    // Reveal existing panel
    existingPanel.reveal(vscode.ViewColumn.One);
    // Update content in case data changed
    const lucideUri = getLocalResource(
      existingPanel.webview,
      context.extensionUri,
      ["resources", "lucide.min.js"],
    );
    existingPanel.webview.html = getSessionViewerHtml(sessionData, lucideUri);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "sessionViewer",
    `Session: ${sessionData.session}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      enableFindWidget: true,
    },
  );

  // Store panel reference
  openSessionPanels.set(panelKey, panel);

  // Remove from map when panel is disposed
  panel.onDidDispose(() => {
    openSessionPanels.delete(panelKey);
  });

  const lucideUri = getLocalResource(panel.webview, context.extensionUri, [
    "resources",
    "lucide.min.js",
  ]);

  panel.webview.html = getSessionViewerHtml(sessionData, lucideUri);
}

function getSessionViewerHtml(
  sessionData: SessionData,
  lucideUri: vscode.Uri,
): string {
  const formFieldsJson = JSON.stringify(sessionData.sessionForm.formFields);
  const formCommandsJson = JSON.stringify(sessionData.sessionForm.formCommands);
  const standardCommandsJson = JSON.stringify(
    sessionData.sessionForm.enabledStandardCommands,
  );

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
            --accent: var(--vscode-button-background);
            --font: var(--vscode-font-family, 'Inter', sans-serif);
            --hover-bg: var(--vscode-list-hoverBackground);
            --active-tab-bg: var(--vscode-tab-activeBackground);
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
            padding: 16px 20px;
            margin-bottom: 20px;
        }

        .header h1 {
            margin: 0 0 12px 0;
            font-size: 22px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: 'Segoe UI', 'Ubuntu', 'Roboto', system-ui, sans-serif;
        }

        .header h1 .description {
            opacity: 0.7;
            font-weight: 400;
        }

        .header-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            font-size: 13px;
        }

        .header-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .header-label {
            font-size: 11px;
            text-transform: uppercase;
            opacity: 0.7;
            font-weight: 600;
            letter-spacing: 0.5px;
        }

        .header-value {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 12px;
        }

        .tabs {
            display: flex;
            gap: 4px;
            border-bottom: 1px solid var(--border);
            margin-bottom: 16px;
        }

        .tab {
            padding: 10px 20px;
            background: transparent;
            border: none;
            color: var(--fg);
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            border-bottom: 2px solid transparent;
            opacity: 0.7;
            transition: all 0.2s;
        }

        .tab:hover {
            opacity: 1;
            background: var(--hover-bg);
        }

        .tab.active {
            opacity: 1;
            border-bottom-color: var(--accent);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .table-wrapper {
            overflow-x: auto;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            background: var(--vscode-editorWidget-background);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;
        }

        thead {
            background: var(--vscode-editorGroupHeader-tabsBackground);
            position: sticky;
            top: 0;
            z-index: 1;
        }

        th {
            text-align: left;
            padding: 8px 12px;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.9;
            border-bottom: 1px solid var(--border);
        }

        td {
            padding: 6px 12px;
            border-bottom: 1px solid var(--border);
            vertical-align: top;
        }

        tr:last-child td {
            border-bottom: none;
        }

        tbody tr:hover {
            background: var(--hover-bg);
        }

        .code {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 11px;
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
        }

        .icon {
            width: 20px;
            height: 20px;
            vertical-align: middle;
        }

        .command-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .command-item {
            padding: 8px 16px;
            border-bottom: 1px solid var(--border);
            font-size: 12px;
            font-family: 'Consolas', 'Courier New', monospace;
        }

        .command-item:last-child {
            border-bottom: none;
        }

        .command-item:hover {
            background: var(--hover-bg);
        }

        .search-container {
            margin-bottom: 16px;
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .search-input {
            flex: 1;
            padding: 8px 12px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: var(--radius);
            font-size: 13px;
        }

        .search-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>
                <i data-lucide="layout" class="icon"></i>
                <span>${sessionData.session}</span>
                ${sessionData.sessionDescription ? `<span class="description">[${sessionData.sessionDescription}]</span>` : ""}
            </h1>
            <div class="header-grid">
                <div class="header-item">
                    <div class="header-label">Program Script</div>
                    <div class="header-value">${sessionData.programScript}</div>
                </div>
                <div class="header-item">
                    <div class="header-label">Main Table</div>
                    <div class="header-value">${sessionData.mainTable}</div>
                </div>
                <div class="header-item">
                    <div class="header-label">Session Type</div>
                    <div class="header-value">${sessionData.sessionType}</div>
                </div>
                <div class="header-item">
                    <div class="header-label">Window Type</div>
                    <div class="header-value">${sessionData.windowType}</div>
                </div>
                <div class="header-item">
                    <div class="header-label">Start Command</div>
                    <div class="header-value">${sessionData.startCommand}</div>
                </div>
                <div class="header-item">
                    <div class="header-label">Session Form</div>
                    <div class="header-value">${sessionData.sessionForm.sessionForm}</div>
                </div>
            </div>
        </div>

        <div class="tabs">
            <button class="tab active" onclick="switchTab(0)">
                <i data-lucide="list" style="width:14px;height:14px;vertical-align:middle;"></i>
                Form Fields (${sessionData.sessionForm.formFields.length})
            </button>
            <button class="tab" onclick="switchTab(1)">
                <i data-lucide="terminal" style="width:14px;height:14px;vertical-align:middle;"></i>
                Form Commands (${sessionData.sessionForm.formCommands.length})
            </button>
            <button class="tab" onclick="switchTab(2)">
                <i data-lucide="zap" style="width:14px;height:14px;vertical-align:middle;"></i>
                Standard Commands (${sessionData.sessionForm.enabledStandardCommands.length})
            </button>
        </div>

        <div class="search-container">
            <input type="text" id="searchInput" class="search-input" placeholder="Search in session..." />
        </div>

        <div id="tab-0" class="tab-content active">
            <div class="table-wrapper">
                <table id="fields-table">
                    <thead>
                        <tr>
                            <th>Seq</th>
                            <th>Field Name</th>
                            <th>Field Label</th>
                            <th>Field Type</th>
                            <th>Domain</th>
                            <th>Datatype</th>
                            <th>Zoom Type</th>
                            <th>Zoom To Program</th>
                            <th>Zoom Return Field</th>
                        </tr>
                    </thead>
                    <tbody id="fields-tbody"></tbody>
                </table>
            </div>
        </div>

        <div id="tab-1" class="tab-content">
            <div class="table-wrapper">
                <table id="commands-table">
                    <thead>
                        <tr>
                            <th>Serial #</th>
                            <th>Command Type</th>
                            <th>Activate</th>
                            <th>Session/Function/Method</th>
                            <th>Description</th>
                            <th>Button</th>
                            <th>Sort Seq</th>
                            <th>Availability</th>
                            <th>Detail</th>
                        </tr>
                    </thead>
                    <tbody id="commands-tbody"></tbody>
                </table>
            </div>
        </div>

        <div id="tab-2" class="tab-content">
            <div class="table-wrapper">
                <ul id="standard-commands-list" class="command-list"></ul>
            </div>
        </div>
    </div>

    <script>
        lucide.createIcons();
        const formFields = ${formFieldsJson};
        const formCommands = ${formCommandsJson};
        const standardCommands = ${standardCommandsJson};

        function switchTab(index) {
            document.querySelectorAll('.tab').forEach((tab, i) => {
                tab.classList.toggle('active', i === index);
            });
            document.querySelectorAll('.tab-content').forEach((content, i) => {
                content.classList.toggle('active', i === index);
            });
        }

        function renderFormFields() {
            const tbody = document.getElementById('fields-tbody');
            tbody.innerHTML = formFields.map(field => {
                return \`<tr>
                    <td>\${field.sequence}</td>
                    <td>\${field.fieldName ? \`<span class="code">\${field.fieldName}</span>\` : ''}</td>
                    <td>\${field.fieldLabel || ''}</td>
                    <td>\${field.fieldType || ''}</td>
                    <td>\${field.domain ? \`<span class="code">\${field.domain}</span>\` : ''}</td>
                    <td>\${field.datatype || ''}</td>
                    <td>\${field.zoomType || ''}</td>
                    <td>\${field.zoomToProgram ? \`<span class="code">\${field.zoomToProgram}</span>\` : ''}</td>
                    <td>\${field.zoomReturnField ? \`<span class="code">\${field.zoomReturnField}</span>\` : ''}</td>
                </tr>\`;
            }).join('');
        }

        function renderFormCommands() {
            const tbody = document.getElementById('commands-tbody');
            tbody.innerHTML = formCommands.map(cmd => {
                return \`<tr>
                    <td>\${cmd.serialNumber}</td>
                    <td>\${cmd.commandType}</td>
                    <td>\${cmd.activateA}</td>
                    <td>\${cmd["Name of Session/Function/Method"] ? \`<span class="code">\${cmd["Name of Session/Function/Method"]}</span>\` : ''}</td>
                    <td>\${cmd.description}</td>
                    <td>\${cmd.button}</td>
                    <td>\${cmd.sortSequence}</td>
                    <td>\${cmd.commandAvailability}</td>
                    <td>\${cmd.detail}</td>
                </tr>\`;
            }).join('');
        }

        function renderStandardCommands() {
            const list = document.getElementById('standard-commands-list');
            list.innerHTML = standardCommands.map(cmd => {
                return \`<li class="command-item">\${cmd}</li>\`;
            }).join('');
        }

        function searchSession(searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            const rows = document.querySelectorAll('#fields-tbody tr, #commands-tbody tr');
            const commandItems = document.querySelectorAll('.command-item');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(lowerSearch)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });

            commandItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(lowerSearch)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        }

        // Setup search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            searchSession(e.target.value);
        });

        renderFormFields();
        renderFormCommands();
        renderStandardCommands();
    </script>
</body>
</html>`;
}
