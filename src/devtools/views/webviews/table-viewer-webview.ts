import * as vscode from "vscode";
import { getLocalResource } from "../../utils/webview-helpers";

interface TableData {
  table: string;
  description: string;
  tableIndices: Array<{
    name: string;
    indexFields: string[];
  }>;
  tableFields: Array<{
    name: string;
    description?: string;
    domain?: string;
    datatype?: string;
    enumDescr?: string;
    enumDomainData?: Array<{
      constant: string;
      description: string;
    }>;
    mandatory?: string;
    initialValue?: string;
    referenceTable?: string;
    referenceMode?: string;
    checkByDBMS?: string;
    deleteMode?: string;
  }>;
}

// Store for open table viewer panels
const openTablePanels = new Map<string, vscode.WebviewPanel>();

export function showTableViewer(
  context: vscode.ExtensionContext,
  tableData: TableData,
): void {
  const panelKey = `table:${tableData.table}`;

  // Check if panel already exists
  const existingPanel = openTablePanels.get(panelKey);
  if (existingPanel) {
    // Reveal existing panel
    existingPanel.reveal(vscode.ViewColumn.One);
    // Update content in case data changed
    const lucideUri = getLocalResource(
      existingPanel.webview,
      context.extensionUri,
      ["resources", "lucide.min.js"],
    );
    existingPanel.webview.html = getTableViewerHtml(tableData, lucideUri);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "tableViewer",
    `Table: ${tableData.table}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      enableFindWidget: true,
    },
  );

  // Store panel reference
  openTablePanels.set(panelKey, panel);

  // Remove from map when panel is disposed
  panel.onDidDispose(() => {
    openTablePanels.delete(panelKey);
  });

  const lucideUri = getLocalResource(panel.webview, context.extensionUri, [
    "resources",
    "lucide.min.js",
  ]);

  panel.webview.html = getTableViewerHtml(tableData, lucideUri);

  // No need for message handling anymore - enum dialog is in webview
}

function getTableViewerHtml(
  tableData: TableData,
  lucideUri: vscode.Uri,
): string {
  const tableFieldsJson = JSON.stringify(tableData.tableFields);
  const tableIndicesJson = JSON.stringify(tableData.tableIndices);

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
            margin: 0;
            font-size: 22px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: 'Segoe UI', 'Ubuntu', 'Roboto', system-ui, sans-serif;
        }

        .header .description {
            opacity: 0.7;
            font-weight: 400;
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

        .enum-list {
            font-size: 11px;
            margin: 0;
            padding-left: 16px;
        }

        .enum-list li {
            margin: 2px 0;
        }

        .icon {
            width: 20px;
            height: 20px;
            vertical-align: middle;
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

        .enum-btn {
            background: var(--accent);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
        }

        .enum-btn:hover {
            filter: brightness(1.1);
        }

        .highlight {
            background-color: var(--vscode-editor-findMatchHighlightBackground);
            color: var(--vscode-editor-foreground);
        }

        /* Modal styles */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .modal-overlay.show {
            display: flex;
        }

        .modal-content {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 20px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border);
        }

        .modal-title {
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .modal-subtitle {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
            font-weight: 400;
        }

        .modal-close-btn {
            background: transparent;
            border: none;
            color: var(--fg);
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
        }

        .modal-close-btn:hover {
            background: var(--hover-bg);
        }

        .modal-body {
            overflow-y: auto;
            flex: 1;
        }

        .enum-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            font-family: 'Consolas', 'Courier New', monospace;
        }

        .enum-table thead {
            background: var(--vscode-editorGroupHeader-tabsBackground);
            position: sticky;
            top: 0;
        }

        .enum-table th {
            text-align: left;
            padding: 8px 12px;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid var(--border);
        }

        .enum-table td {
            padding: 8px 12px;
            border-bottom: 1px solid var(--border);
        }

        .enum-table tr:last-child td {
            border-bottom: none;
        }

        .enum-table tbody tr:hover {
            background: var(--hover-bg);
        }

        .enum-constant {
            color: var(--vscode-symbolIcon-constantForeground, var(--accent));
            font-weight: 600;
        }

        .enum-description {
            color: var(--fg);
        }

        .enum-list-modal {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .enum-item {
            padding: 10px 12px;
            border-bottom: 1px solid var(--border);
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.1s;
        }

        .enum-item:hover {
            background: var(--hover-bg);
        }

        .enum-item:last-child {
            border-bottom: none;
        }

        .enum-constant {
            color: var(--vscode-symbolIcon-constantForeground, var(--accent));
            font-weight: 600;
            margin-right: 8px;
        }

        .enum-description {
            color: var(--fg);
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>
                <i data-lucide="database" class="icon"></i>
                <span>${tableData.table}</span>
                ${tableData.description ? `<span class="description">[${tableData.description}]</span>` : ""}
            </h1>
        </div>

        <div class="tabs">
            <button class="tab active" onclick="switchTab(0)">
                <i data-lucide="columns" style="width:14px;height:14px;vertical-align:middle;"></i>
                Table Fields (${tableData.tableFields.length})
            </button>
            <button class="tab" onclick="switchTab(1)">
                <i data-lucide="key" style="width:14px;height:14px;vertical-align:middle;"></i>
                Table Indices (${tableData.tableIndices.length})
            </button>
        </div>

        <div class="search-container">
            <input type="text" id="searchInput" class="search-input" placeholder="Search in table..." />
        </div>

        <div id="tab-0" class="tab-content active">
            <div class="table-wrapper">
                <table id="fields-table">
                    <thead>
                        <tr>
                            <th>Field Name</th>
                            <th>Description</th>
                            <th>Domain</th>
                            <th>Datatype</th>
                            <th>Mandatory</th>
                            <th>Initial Value</th>
                            <th>Reference Table</th>
                            <th>Enum Values</th>
                        </tr>
                    </thead>
                    <tbody id="fields-tbody"></tbody>
                </table>
            </div>
        </div>

        <div id="tab-1" class="tab-content">
            <div class="table-wrapper">
                <table id="indices-table">
                    <thead>
                        <tr>
                            <th>Index Name</th>
                            <th>Index Fields</th>
                        </tr>
                    </thead>
                    <tbody id="indices-tbody"></tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Enum Modal Dialog -->
    <div id="enumModal" class="modal-overlay">
        <div class="modal-content">
            <div class="modal-header">
                <div>
                    <div class="modal-title">
                        <i data-lucide="list" style="width:18px;height:18px;"></i>
                        <span id="modalFieldName">Enum Values</span>
                        <span id="modalDomainName" style="color: var(--vscode-descriptionForeground); font-size: 14px;"></span>
                    </div>
                    <div class="modal-subtitle" id="modalEnumDesc"></div>
                </div>
                <button class="modal-close-btn" onclick="closeEnumModal()">
                    <i data-lucide="x" style="width:20px;height:20px;"></i>
                </button>
            </div>
            <div class="modal-body">
                <table id="enumTableModal" class="enum-table">
                    <thead>
                        <tr>
                            <th>Constant</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody id="enumTableBody"></tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        lucide.createIcons();
        const vscode = acquireVsCodeApi();
        const tableFields = ${tableFieldsJson};
        const tableIndices = ${tableIndicesJson};

        function switchTab(index) {
            document.querySelectorAll('.tab').forEach((tab, i) => {
                tab.classList.toggle('active', i === index);
            });
            document.querySelectorAll('.tab-content').forEach((content, i) => {
                content.classList.toggle('active', i === index);
            });
        }

        function showEnumDialog(enumData, fieldName) {
            const modal = document.getElementById('enumModal');
            const modalFieldName = document.getElementById('modalFieldName');
            const modalDomainName = document.getElementById('modalDomainName');
            const modalEnumDesc = document.getElementById('modalEnumDesc');
            const enumTableBody = document.getElementById('enumTableBody');
            
            // Find the field data to get domain and enumDescr
            const field = tableFields.find(f => f.name === fieldName);
            
            modalFieldName.textContent = \`Enum Values: \${fieldName}\`;
            
            if (field && field.domain) {
                modalDomainName.textContent = \`(\${field.domain})\`;
            } else {
                modalDomainName.textContent = '';
            }
            
            if (field && field.enumDescr) {
                modalEnumDesc.textContent = field.enumDescr;
            } else {
                modalEnumDesc.textContent = '';
            }
            
            // Render enum data as table rows
            enumTableBody.innerHTML = enumData.map(e => 
                \`<tr>
                    <td class="enum-constant">\${e.constant}</td>
                    <td class="enum-description">\${e.description}</td>
                </tr>\`
            ).join('');
            
            modal.classList.add('show');
            
            // Re-create icons for modal
            lucide.createIcons();
        }

        function closeEnumModal() {
            document.getElementById('enumModal').classList.remove('show');
        }

        // Close modal on overlay click
        document.getElementById('enumModal').addEventListener('click', (e) => {
            if (e.target.id === 'enumModal') {
                closeEnumModal();
            }
        });

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeEnumModal();
            }
        });

        function renderTableFields() {
            const tbody = document.getElementById('fields-tbody');
            tbody.innerHTML = tableFields.map(field => {
                let enumHtml = '';
                if (field.enumDomainData && field.enumDomainData.length > 0) {
                    enumHtml = \`<button class="enum-btn" onclick='showEnumDialog(\${JSON.stringify(field.enumDomainData)}, "\${field.name}")'>View Enum (\${field.enumDomainData.length})</button>\`;
                }
                
                return \`<tr>
                    <td>\${field.name ? \`<span class="code">\${field.name}</span>\` : ''}</td>
                    <td>\${field.description || ''}</td>
                    <td>\${field.domain ? \`<span class="code">\${field.domain}</span>\` : ''}</td>
                    <td>\${field.datatype || ''}</td>
                    <td>\${field.mandatory || ''}</td>
                    <td>\${field.initialValue ? \`<span class="code">\${field.initialValue}</span>\` : ''}</td>
                    <td>\${field.referenceTable ? \`<span class="code">\${field.referenceTable}</span>\` : ''}</td>
                    <td>\${enumHtml}</td>
                </tr>\`;
            }).join('');
        }

        function renderTableIndices() {
            const tbody = document.getElementById('indices-tbody');
            tbody.innerHTML = tableIndices.map(index => {
                return \`<tr>
                    <td>\${index.name ? \`<span class="code">\${index.name}</span>\` : ''}</td>
                    <td>\${index.indexFields.map(f => \`<span class="code">\${f}</span>\`).join(', ')}</td>
                </tr>\`;
            }).join('');
        }

        function highlightText(text, search) {
            if (!search) {
                return text;
            }
            const regex = new RegExp(\`(\${search})\`, 'gi');
            return text.replace(regex, '<span class="highlight">$1</span>');
        }

        function searchTable(searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            const rows = document.querySelectorAll('#fields-tbody tr, #indices-tbody tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(lowerSearch)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }

        // Setup search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            searchTable(e.target.value);
        });

        renderTableFields();
        renderTableIndices();
    </script>
</body>
</html>`;
}
