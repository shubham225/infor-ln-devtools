import * as vscode from "vscode";
import * as os from "os";
import type { EnvironmentMapping, ConfigSettings } from "../../types/api";
import { getLocalResource } from "../../utils/webview-helpers";

export async function showConfigurationForm(
  context: vscode.ExtensionContext,
  currentSettings: ConfigSettings,
): Promise<ConfigSettings | null> {
  const panel = vscode.window.createWebviewPanel(
    "configForm",
    "Extension Settings",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    },
  );

  // 1. Determine Identity Information
  const systemUserName = os.userInfo().username;
  let userName = systemUserName;

  // Get the local path to lucide.js (assuming it's in a 'media' folder)
  const lucideUri = getLocalResource(panel.webview, context.extensionUri, [
    "resources",
    "lucide.min.js",
  ]);

  panel.webview.html = getWebviewContent(currentSettings, userName, lucideUri);

  return new Promise((resolve) => {
    panel.webview.onDidReceiveMessage((message) => {
      if (message.command === "save") {
        resolve({
          environments: message.environments,
          defaultEnvironment: message.defaultEnvironment,
        });
        panel.dispose();
      } else if (message.command === "cancel") {
        resolve(null);
        panel.dispose();
      }
    });

    panel.onDidDispose(() => resolve(null));
  });
}

function getWebviewContent(
  settings: ConfigSettings,
  userName: string,
  lucideUri: vscode.Uri,
): string {
  const environmentsJson = JSON.stringify(settings.environments || []);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="${lucideUri}"></script>
    <style>
        :root {
            --radius: 8px;
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-foreground);
            --border: var(--vscode-panel-border);
            --input-bg: var(--vscode-input-background);
            --accent: var(--vscode-button-background);
            --error: var(--vscode-errorForeground);
            --font: var(--vscode-font-family, 'Inter', sans-serif);
        }

        body {
            font-family: var(--font);
            background-color: var(--bg);
            color: var(--fg);
            margin: 0;
            padding: 60px 40px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        /* --- RED RING STYLE --- */
        input.invalid {
            border-color: var(--error) !important;
            box-shadow: 0 0 0 1px var(--error) !important;
        }

        /* Top User Profile */
        .user-header {
            position: absolute;
            top: 20px;
            right: 40px;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            border: 1px solid var(--border);
        }

        .user-avatar {
            width: 20px;
            height: 20px;
            color: var(--accent);
        }

        .user-text { color: var(--vscode-descriptionForeground); font-size: 12px; }
        .user-name { font-size: 12px; }

        /* Large Form Layout */
        .form-container {
            width: 100%;
            max-width: 720px;
            animation: fadeIn 0.5s ease;
        }

        .heading-group { margin-bottom: 38px; }
        h1 { font-size: 32px; font-weight: 600; margin-bottom: 8px; letter-spacing: -0.5px; }
        .desc { color: var(--vscode-descriptionForeground); font-size: 15px; }

        .form-grid { display: grid; gap: 10px; }

        /* Input Styles with Icons */
        .form-item { display: flex; flex-direction: column; gap: 8px; position: relative; }
        label { font-size: 13px; font-weight: 600; text-transform: uppercase; opacity: 0.7; letter-spacing: 0.5px; }
        
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .input-icon { position: absolute; left: 12px; width: 18px; height: 18px; opacity: 0.5; pointer-events: none; }
        
        input, .search-select-input {
            width: 100%;
            padding: 12px 12px 12px 40px;
            background: var(--input-bg);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: var(--radius);
            font-size: 14px;
            transition: all 0.2s;
        }

        input:focus, .search-select-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px rgba(var(--vscode-focusBorder), 0.1);
        }

        /* Searchable Dropdown Logic */
        .dropdown-wrapper { position: relative; width: 100%; }
        .options-list {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            margin-top: 4px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 100;
            display: none;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }
        .option-item {
            padding: 10px 15px;
            cursor: pointer;
            font-size: 14px;
        }
        .option-item:hover { background: var(--vscode-list-hoverBackground); }

        /* Error Text */
        .error-label {
            font-size: 12px;
            color: var(--error);
            margin-top: 4px;
            font-weight: 500;
            height: 14px;
            opacity: 0;
        }
        .error-label.visible { opacity: 1; }

        /* Environment Table Styles */
        .env-table-container {
            margin: 20px 0;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            overflow: hidden;
        }
        .env-table {
            width: 100%;
            border-collapse: collapse;
        }
        .env-table thead {
            background: var(--vscode-editor-background);
        }
        .env-table th, .env-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }
        .env-table th {
            font-weight: 600;
            font-size: 13px;
            text-transform: uppercase;
            opacity: 0.7;
        }
        .env-table input {
            width: 100%;
            padding: 8px;
            background: var(--input-bg);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 14px;
        }
        .env-table .delete-btn {
            padding: 6px 10px;
            background: var(--error);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .add-env-btn {
            margin-top: 10px;
            padding: 8px 16px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: var(--radius);
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
        }
        .add-env-btn:hover, .env-table .delete-btn:hover { filter: brightness(1.1); }

        /* Buttons */
        .actions {
            margin-top: 30px;
            display: flex;
            gap: 12px;
            padding-top: 30px;
            border-top: 1px solid var(--border);
        }
        button {
            padding: 12px 24px;
            border-radius: var(--radius);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            border: none;
        }
        .btn-save { background: var(--accent); color: var(--vscode-button-foreground); }
        .btn-cancel { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        button:hover { filter: brightness(1.1); }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="user-header">
        <i data-lucide="user" class="user-avatar"></i>
        <span> <span class="user-text">Logged in: <span><strong class="user-name">${userName}</strong></span>
    </div>

    <div class="form-container">
        <div class="heading-group">
            <h1>Infor LN DevTools Settings</h1>
            <p class="desc">Define your environment endpoints and project local settings.</p>
        </div>

        <form id="configForm">
            <div class="form-grid">
                <div class="form-item">
                    <label>Environment Mappings</label>
                    <div class="env-table-container">
                        <table class="env-table">
                            <thead>
                                <tr>
                                    <th style="width: 30%">Environment</th>
                                    <th style="width: 60%">Backend URL</th>
                                    <th style="width: 10%">Action</th>
                                </tr>
                            </thead>
                            <tbody id="envTableBody">
                            </tbody>
                        </table>
                    </div>
                    <button type="button" class="add-env-btn" id="addEnvBtn">
                        <i data-lucide="plus" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i>
                        Add Environment
                    </button>
                    <div class="error-label" id="err-environments">At least one environment is required</div>
                </div>

                <div class="form-item">
                    <label>Default Environment</label>
                    <div class="dropdown-wrapper">
                        <div class="input-wrapper">
                            <i data-lucide="check-circle" class="input-icon"></i>
                            <input type="text" id="defaultEnvInput" placeholder="Search or select default environment..." autocomplete="off">
                        </div>
                        <div id="defaultEnvList" class="options-list"></div>
                    </div>
                    <div class="error-label" id="err-defaultEnv">Default environment is required</div>
                </div>
            </div>

            <div class="actions">
                <button type="submit" class="btn-save">Save Settings</button>
                <button type="button" id="cancelBtn" class="btn-cancel">Cancel</button>
            </div>
        </form>
    </div>

    <script>
        lucide.createIcons();
        const vscode = acquireVsCodeApi();
        let environments = ${environmentsJson};
        
        const envTableBody = document.getElementById('envTableBody');
        const defaultEnvInput = document.getElementById('defaultEnvInput');
        const defaultEnvDropdown = document.getElementById('defaultEnvList');

        // Initialize table with existing environments or add one empty row
        function initTable() {
            if (environments.length === 0) {
                environments.push({ environment: '', backendUrl: '' });
            }
            renderTable();
            updateDefaultEnvDropdown();
            
            // Set default environment if exists
            const defaultEnv = '${settings.defaultEnvironment || ""}';
            if (defaultEnv) {
                defaultEnvInput.value = defaultEnv;
            }
        }

        // Searchable Dropdown Logic for Default Environment
        defaultEnvInput.addEventListener('input', () => {
            defaultEnvInput.classList.remove('invalid');
            const val = defaultEnvInput.value.toLowerCase();
            const validEnvs = environments.filter(e => e.environment.trim() !== '');
            const filtered = validEnvs
                .map(e => e.environment)
                .filter(env => env.toLowerCase().includes(val));
            renderDefaultEnvDropdown(filtered);
            defaultEnvDropdown.style.display = filtered.length ? 'block' : 'none';
        });

        defaultEnvInput.addEventListener('focus', () => {
            const validEnvs = environments.filter(e => e.environment.trim() !== '');
            if(validEnvs.length) {
                renderDefaultEnvDropdown(validEnvs.map(e => e.environment));
                defaultEnvDropdown.style.display = 'block';
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-wrapper')) {
                defaultEnvDropdown.style.display = 'none';
            }
        });

        function renderDefaultEnvDropdown(list) {
            defaultEnvDropdown.innerHTML = list.map(item => \`<div class="option-item">\${item}</div>\`).join('');
            defaultEnvDropdown.querySelectorAll('.option-item').forEach(el => {
                el.onclick = () => {
                    defaultEnvInput.value = el.textContent;
                    defaultEnvInput.classList.remove('invalid');
                    defaultEnvDropdown.style.display = 'none';
                };
            });
        }

        function renderTable() {
            envTableBody.innerHTML = environments.map((env, idx) => \`
                <tr>
                    <td>
                        <input type="text" 
                               class="env-name" 
                               data-idx="\${idx}" 
                               value="\${env.environment}" 
                               placeholder="e.g., Alpha, Beta, Production">
                    </td>
                    <td>
                        <input type="text" 
                               class="env-url" 
                               data-idx="\${idx}" 
                               value="\${env.backendUrl}" 
                               placeholder="https://api.yourdomain.com:8312/c4ws/services/ERPIntegrator/ERP_850">
                    </td>
                    <td>
                        <button type="button" class="delete-btn" data-idx="\${idx}">Delete</button>
                    </td>
                </tr>
            \`).join('');

            // Add event listeners
            document.querySelectorAll('.env-name, .env-url').forEach(input => {
                input.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    const field = e.target.classList.contains('env-name') ? 'environment' : 'backendUrl';
                    environments[idx][field] = e.target.value;
                    
                    if (field === 'environment') {
                        updateDefaultEnvDropdown();
                    }
                });
            });

            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    const removedEnv = environments[idx].environment;
                    environments.splice(idx, 1);
                    
                    // If we deleted the default environment, clear it
                    if (defaultEnvInput.value === removedEnv) {
                        defaultEnvInput.value = '';
                    }
                    
                    renderTable();
                    updateDefaultEnvDropdown();
                    lucide.createIcons();
                });
            });

            lucide.createIcons();
        }

        function updateDefaultEnvDropdown() {
            const currentValue = defaultEnvInput.value;
            const validEnvs = environments.filter(e => e.environment.trim() !== '');
            
            // Clear the input if current value is no longer valid
            if (currentValue && !validEnvs.some(e => e.environment === currentValue)) {
                defaultEnvInput.value = '';
            }
        }

        document.getElementById('addEnvBtn').addEventListener('click', () => {
            environments.push({ environment: '', backendUrl: '' });
            renderTable();
        });

        // Validation & Submit
        document.getElementById('configForm').onsubmit = (e) => {
            e.preventDefault();
            let valid = true;

            // Validate environments
            const validEnvs = environments.filter(env => 
                env.environment.trim() !== '' && env.backendUrl.trim() !== ''
            );

            if (validEnvs.length === 0) {
                document.getElementById('err-environments').classList.add('visible');
                valid = false;
            } else {
                document.getElementById('err-environments').classList.remove('visible');
            }

            // Validate default environment
            const defaultEnv = defaultEnvInput.value.trim();
            if (!defaultEnv || !validEnvs.some(e => e.environment === defaultEnv)) {
                document.getElementById('err-defaultEnv').classList.add('visible');
                defaultEnvInput.classList.add('invalid');
                valid = false;
            } else {
                document.getElementById('err-defaultEnv').classList.remove('visible');
                defaultEnvInput.classList.remove('invalid');
            }

            if(valid) {
                vscode.postMessage({
                    command: 'save',
                    environments: validEnvs,
                    defaultEnvironment: defaultEnv
                });
            }
        };

        document.getElementById('cancelBtn').onclick = () => vscode.postMessage({ command: 'cancel' });
        
        // Initialize
        initTable();
    </script>
</body>
</html>`;
}
