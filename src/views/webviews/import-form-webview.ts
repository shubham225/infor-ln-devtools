import * as vscode from "vscode";
import type { ImportFormSettings, ImportByPMCFormSettings } from "../../types/api";
import { getLocalResource } from "../../utils/webview-helpers";

export async function showImportForm(
  context: vscode.ExtensionContext,
  vrcList: string[] = [],
  defaultVrc: string = "",
): Promise<ImportFormSettings | null> {
  const panel = vscode.window.createWebviewPanel(
    "importForm",
    "Import Selected Components",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    },
  );

  const lucideUri = getLocalResource(panel.webview, context.extensionUri, ['resources', 'lucide.min.js']);

  panel.webview.html = getImportFormWebviewContent(vrcList, defaultVrc, lucideUri);

  return new Promise((resolve) => {
    panel.webview.onDidReceiveMessage((message) => {
      if (message.command === "import") {
        resolve({
          projectName: message.projectName,
          vrc: message.vrc,
          role: message.role,
          ticketId: message.ticketId,
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

export async function showImportByPMCForm(
  context: vscode.ExtensionContext,
  vrcList: string[] = [],
  fetchVRCsCallback: (pmc: string) => Promise<string[]>,
): Promise<ImportByPMCFormSettings | null> {
  const panel = vscode.window.createWebviewPanel(
    "importByPMCForm",
    "Import Components by PMC",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    },
  );

  const lucideUri = getLocalResource(panel.webview, context.extensionUri, ['resources', 'lucide.min.js']);

  panel.webview.html = getImportByPMCFormWebviewContent(vrcList, lucideUri);

  return new Promise((resolve) => {
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "import") {
        resolve({
          pmc: message.pmc,
          vrc: message.vrc,
          role: message.role,
          ticketId: message.ticketId,
        });
        panel.dispose();
      } else if (message.command === "cancel") {
        resolve(null);
        panel.dispose();
      } else if (message.command === "fetchVRCs") {
        // Fetch VRCs based on PMC
        const vrcs = await fetchVRCsCallback(message.pmc);
        panel.webview.postMessage({
          command: "updateVRCs",
          vrcs: vrcs,
        });
      }
    });

    panel.onDidDispose(() => resolve(null));
  });
}

function getImportFormWebviewContent(
  vrcList: string[],
  defaultVrc: string,
  lucideUri: vscode.Uri,
): string {
  const vrcOptionsJson = JSON.stringify(vrcList);

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

        input.invalid {
            border-color: var(--error) !important;
            box-shadow: 0 0 0 1px var(--error) !important;
        }

        .form-container {
            width: 100%;
            max-width: 720px;
            animation: fadeIn 0.5s ease;
        }

        .heading-group { margin-bottom: 38px; }
        h1 { font-size: 32px; font-weight: 600; margin-bottom: 8px; letter-spacing: -0.5px; }
        .desc { color: var(--vscode-descriptionForeground); font-size: 15px; }

        .form-grid { display: grid; gap: 10px; }

        .form-item { display: flex; flex-direction: column; gap: 8px; position: relative; }
        label { font-size: 13px; font-weight: 600; text-transform: uppercase; opacity: 0.7; letter-spacing: 0.5px; }
        
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .input-icon { position: absolute; left: 12px; width: 18px; height: 18px; opacity: 0.5; pointer-events: none; }
        
        input {
            width: 100%;
            padding: 12px 12px 12px 40px;
            background: var(--input-bg);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: var(--radius);
            font-size: 14px;
            transition: all 0.2s;
        }

        input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px rgba(var(--vscode-focusBorder), 0.1);
        }

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

        .error-label {
            font-size: 12px;
            color: var(--error);
            margin-top: 4px;
            font-weight: 500;
            height: 14px;
            opacity: 0;
        }
        .error-label.visible { opacity: 1; }

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
        .btn-import { background: var(--accent); color: var(--vscode-button-foreground); }
        .btn-cancel { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        button:hover { filter: brightness(1.1); }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="form-container">
        <div class="heading-group">
            <h1>Import Selected Components</h1>
            <p class="desc">Provide project details and import selected components.</p>
        </div>

        <form id="importForm">
            <div class="form-grid">
                <div class="form-item">
                    <label>Project Name</label>
                    <div class="input-wrapper">
                        <i data-lucide="folder" class="input-icon"></i>
                        <input type="text" id="projectName" placeholder="e.g. 300003">
                    </div>
                    <div class="error-label" id="err-projectName">Project name is required</div>
                </div>

                <div class="form-item">
                    <label>VRC</label>
                    <div class="dropdown-wrapper">
                        <div class="input-wrapper">
                            <i data-lucide="git-branch" class="input-icon"></i>
                            <input type="text" id="vrcInput" placeholder="Search or type VRC..." value="${defaultVrc}" autocomplete="off">
                        </div>
                        <div id="vrcList" class="options-list"></div>
                    </div>
                    <div class="error-label" id="err-vrc">VRC is required</div>
                </div>

                <div class="form-item">
                    <label>Role</label>
                    <div class="dropdown-wrapper">
                        <div class="input-wrapper">
                            <i data-lucide="user-check" class="input-icon"></i>
                            <input type="text" id="roleInput" placeholder="Search or select role..." autocomplete="off">
                        </div>
                        <div id="roleList" class="options-list"></div>
                    </div>
                    <div class="error-label" id="err-role">Role is required</div>
                </div>

                <div class="form-item">
                    <label>JIRA ID</label>
                    <div class="input-wrapper">
                        <i data-lucide="tag" class="input-icon"></i>
                        <input type="text" id="ticketId" placeholder="e.g. ABC12345">
                    </div>
                    <div class="error-label" id="err-ticketId">Ticket ID is required</div>
                </div>
            </div>

            <div class="actions">
                <button type="submit" class="btn-import">Import</button>
                <button type="button" id="cancelBtn" class="btn-cancel">Cancel</button>
            </div>
        </form>
    </div>

    <script>
        lucide.createIcons();
        const vscode = acquireVsCodeApi();
        const vrcListSource = ${vrcOptionsJson};
        
        const vrcInput = document.getElementById('vrcInput');
        const vrcDropdown = document.getElementById('vrcList');
        const roleInput = document.getElementById('roleInput');
        const roleDropdown = document.getElementById('roleList');
        const rolesSource = ['Developer', 'Reviewer'];

        // Searchable Dropdown Logic for VRC
        vrcInput.addEventListener('input', () => {
            vrcInput.classList.remove('invalid');
            const val = vrcInput.value.toLowerCase();
            const filtered = vrcListSource.filter(item => item.toLowerCase().includes(val));
            renderDropdown(filtered, vrcInput, vrcDropdown);
            vrcDropdown.style.display = filtered.length ? 'block' : 'none';
        });

        vrcInput.addEventListener('focus', () => {
            if(vrcListSource.length) {
                renderDropdown(vrcListSource, vrcInput, vrcDropdown);
                vrcDropdown.style.display = 'block';
            }
        });

        // Searchable Dropdown Logic for Role
        roleInput.addEventListener('input', () => {
            roleInput.classList.remove('invalid');
            const val = roleInput.value.toLowerCase();
            const filtered = rolesSource.filter(item => item.toLowerCase().includes(val));
            renderDropdown(filtered, roleInput, roleDropdown);
            roleDropdown.style.display = filtered.length ? 'block' : 'none';
        });

        roleInput.addEventListener('focus', () => {
            if(rolesSource.length) {
                renderDropdown(rolesSource, roleInput, roleDropdown);
                roleDropdown.style.display = 'block';
            }
        });

        // Clear invalid state on input
        ['projectName', 'ticketId'].forEach(id => {
            document.getElementById(id).addEventListener('input', (e) => e.target.classList.remove('invalid'));
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-wrapper')) {
                vrcDropdown.style.display = 'none';
                roleDropdown.style.display = 'none';
            }
        });

        function renderDropdown(list, input, dropdown) {
            dropdown.innerHTML = list.map(item => \`<div class="option-item">\${item}</div>\`).join('');
            dropdown.querySelectorAll('.option-item').forEach(el => {
                el.onclick = () => {
                    input.value = el.textContent;
                    input.classList.remove('invalid');
                    dropdown.style.display = 'none';
                };
            });
        }

        // Validation & Submit
        document.getElementById('importForm').onsubmit = (e) => {
            e.preventDefault();
            let valid = true;
            
            const fields = [
                { id: 'projectName', errId: 'err-projectName' },
                { id: 'vrcInput', errId: 'err-vrc', list: vrcListSource },
                { id: 'roleInput', errId: 'err-role', list: rolesSource },
                { id: 'ticketId', errId: 'err-ticketId' }
            ];

            fields.forEach(field => {
                const el = document.getElementById(field.id);
                const err = document.getElementById(field.errId);
                
                if(!el.value.trim()) {
                    err.classList.add('visible');
                    el.classList.add('invalid');
                    valid = false;
                } else {
                    if (field.list && field.list.length && !field.list.includes(el.value.trim())) {
                        err.textContent = 'Please select a valid option from the list';
                        err.classList.add('visible');
                        el.classList.add('invalid');
                        valid = false;
                    } else {
                        err.classList.remove('visible');
                        el.classList.remove('invalid');
                    }
                }
            });

            if(valid) {
                vscode.postMessage({
                    command: 'import',
                    projectName: document.getElementById('projectName').value,
                    vrc: vrcInput.value,
                    role: roleInput.value,
                    ticketId: document.getElementById('ticketId').value
                });
            }
        };

        document.getElementById('cancelBtn').onclick = () => vscode.postMessage({ command: 'cancel' });
    </script>
</body>
</html>`;
}

function getImportByPMCFormWebviewContent(
  vrcList: string[],
  lucideUri: vscode.Uri,
): string {
  const vrcOptionsJson = JSON.stringify(vrcList);

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

        input.invalid {
            border-color: var(--error) !important;
            box-shadow: 0 0 0 1px var(--error) !important;
        }

        .form-container {
            width: 100%;
            max-width: 720px;
            animation: fadeIn 0.5s ease;
        }

        .heading-group { margin-bottom: 38px; }
        h1 { font-size: 32px; font-weight: 600; margin-bottom: 8px; letter-spacing: -0.5px; }
        .desc { color: var(--vscode-descriptionForeground); font-size: 15px; }

        .form-grid { display: grid; gap: 10px; }

        .form-item { display: flex; flex-direction: column; gap: 8px; position: relative; }
        label { font-size: 13px; font-weight: 600; text-transform: uppercase; opacity: 0.7; letter-spacing: 0.5px; }
        
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .input-icon { position: absolute; left: 12px; width: 18px; height: 18px; opacity: 0.5; pointer-events: none; }
        
        input {
            width: 100%;
            padding: 12px 12px 12px 40px;
            background: var(--input-bg);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: var(--radius);
            font-size: 14px;
            transition: all 0.2s;
        }

        input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px rgba(var(--vscode-focusBorder), 0.1);
        }

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

        .error-label {
            font-size: 12px;
            color: var(--error);
            margin-top: 4px;
            font-weight: 500;
            height: 14px;
            opacity: 0;
        }
        .error-label.visible { opacity: 1; }

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
        .btn-import { background: var(--accent); color: var(--vscode-button-foreground); }
        .btn-cancel { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        button:hover { filter: brightness(1.1); }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="form-container">
        <div class="heading-group">
            <h1>Import Components by PMC</h1>
            <p class="desc">Provide PMC and project details to import components.</p>
        </div>

        <form id="importForm">
            <div class="form-grid">
                <div class="form-item">
                    <label>PMC Number</label>
                    <div class="input-wrapper">
                        <i data-lucide="hash" class="input-icon"></i>
                        <input type="text" id="pmc" placeholder="e.g. 12345">
                    </div>
                    <div class="error-label" id="err-pmc">PMC number is required</div>
                </div>

                <div class="form-item">
                    <label>Base VRC</label>
                    <div class="dropdown-wrapper">
                        <div class="input-wrapper">
                            <i data-lucide="git-branch" class="input-icon"></i>
                            <input type="text" id="vrcInput" placeholder="Search or type VRC..." autocomplete="off">
                        </div>
                        <div id="vrcList" class="options-list"></div>
                    </div>
                    <div class="error-label" id="err-vrc">VRC is required</div>
                </div>

                <div class="form-item">
                    <label>Role</label>
                    <div class="dropdown-wrapper">
                        <div class="input-wrapper">
                            <i data-lucide="user-check" class="input-icon"></i>
                            <input type="text" id="roleInput" placeholder="Search or select role..." autocomplete="off">
                        </div>
                        <div id="roleList" class="options-list"></div>
                    </div>
                    <div class="error-label" id="err-role">Role is required</div>
                </div>

                <div class="form-item">
                    <label>Ticket ID</label>
                    <div class="input-wrapper">
                        <i data-lucide="tag" class="input-icon"></i>
                        <input type="text" id="ticketId" placeholder="e.g. ABC12345">
                    </div>
                    <div class="error-label" id="err-ticketId">Ticket ID is required</div>
                </div>
            </div>

            <div class="actions">
                <button type="submit" class="btn-import">Import</button>
                <button type="button" id="cancelBtn" class="btn-cancel">Cancel</button>
            </div>
        </form>
    </div>

    <script>
        lucide.createIcons();
        const vscode = acquireVsCodeApi();
        let vrcListSource = ${vrcOptionsJson};
        
        const vrcInput = document.getElementById('vrcInput');
        const vrcDropdown = document.getElementById('vrcList');
        const pmcInput = document.getElementById('pmc');
        const roleInput = document.getElementById('roleInput');
        const roleDropdown = document.getElementById('roleList');
        const rolesSource = ['Developer', 'Reviewer'];

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateVRCs') {
                vrcListSource = message.vrcs;
                // Automatically show dropdown if VRCs are loaded and input is empty
                if (vrcListSource.length > 0 && !vrcInput.value) {
                    renderDropdown(vrcListSource, vrcInput, vrcDropdown);
                    vrcDropdown.style.display = 'block';
                }
            }
        });

        // Fetch VRCs when PMC is entered and user moves away
        pmcInput.addEventListener('blur', () => {
            const pmcValue = pmcInput.value.trim();
            if (pmcValue) {
                vscode.postMessage({
                    command: 'fetchVRCs',
                    pmc: pmcValue
                });
            }
        });

        // Searchable Dropdown Logic for VRC
        vrcInput.addEventListener('input', () => {
            vrcInput.classList.remove('invalid');
            const val = vrcInput.value.toLowerCase();
            const filtered = vrcListSource.filter(item => item.toLowerCase().includes(val));
            renderDropdown(filtered, vrcInput, vrcDropdown);
            vrcDropdown.style.display = filtered.length ? 'block' : 'none';
        });

        vrcInput.addEventListener('focus', () => {
            if(vrcListSource.length) {
                renderDropdown(vrcListSource, vrcInput, vrcDropdown);
                vrcDropdown.style.display = 'block';
            }
        });

        // Searchable Dropdown Logic for Role
        roleInput.addEventListener('input', () => {
            roleInput.classList.remove('invalid');
            const val = roleInput.value.toLowerCase();
            const filtered = rolesSource.filter(item => item.toLowerCase().includes(val));
            renderDropdown(filtered, roleInput, roleDropdown);
            roleDropdown.style.display = filtered.length ? 'block' : 'none';
        });

        roleInput.addEventListener('focus', () => {
            if(rolesSource.length) {
                renderDropdown(rolesSource, roleInput, roleDropdown);
                roleDropdown.style.display = 'block';
            }
        });

        // Clear invalid state on input
        ['pmc', 'ticketId'].forEach(id => {
            document.getElementById(id).addEventListener('input', (e) => e.target.classList.remove('invalid'));
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-wrapper')) {
                vrcDropdown.style.display = 'none';
                roleDropdown.style.display = 'none';
            }
        });

        function renderDropdown(list, input, dropdown) {
            dropdown.innerHTML = list.map(item => \`<div class="option-item">\${item}</div>\`).join('');
            dropdown.querySelectorAll('.option-item').forEach(el => {
                el.onclick = () => {
                    input.value = el.textContent;
                    input.classList.remove('invalid');
                    dropdown.style.display = 'none';
                };
            });
        }

        // Validation & Submit
        document.getElementById('importForm').onsubmit = (e) => {
            e.preventDefault();
            let valid = true;
            
            const fields = [
                { id: 'pmc', errId: 'err-pmc' },
                { id: 'vrcInput', errId: 'err-vrc', list: vrcListSource },
                { id: 'roleInput', errId: 'err-role', list: rolesSource },
                { id: 'ticketId', errId: 'err-ticketId' }
            ];

            fields.forEach(field => {
                const el = document.getElementById(field.id);
                const err = document.getElementById(field.errId);
                
                if(!el.value.trim()) {
                    err.classList.add('visible');
                    el.classList.add('invalid');
                    valid = false;
                } else {
                    // For lists (VRC, role), validate if list is populated
                    if (field.list && field.list.length > 0 && !field.list.includes(el.value.trim())) {
                        err.textContent = 'Please select a valid option from the list';
                        err.classList.add('visible');
                        el.classList.add('invalid');
                        valid = false;
                    } else {
                        err.classList.remove('visible');
                        el.classList.remove('invalid');
                    }
                }
            });

            if(valid) {
                vscode.postMessage({
                    command: 'import',
                    pmc: document.getElementById('pmc').value,
                    vrc: vrcInput.value,
                    role: roleInput.value,
                    ticketId: document.getElementById('ticketId').value
                });
            }
        };

        document.getElementById('cancelBtn').onclick = () => vscode.postMessage({ command: 'cancel' });
    </script>
</body>
</html>`;
}
