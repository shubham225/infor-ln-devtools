import * as vscode from "vscode";
import { Project } from "./project-data-provider";

// Add this helper to the top of your file
function getLocalResource(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]) {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}

export async function showProjectForm(
  context: vscode.ExtensionContext,
  vrcList: string[] = [],
  existingProject?: Project,
): Promise<Project | null> {
  const panel = vscode.window.createWebviewPanel(
    "projectForm",
    existingProject ? "Edit Project" : "New Project",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    },
  );

  const lucideUri = getLocalResource(panel.webview, context.extensionUri, ['resources', 'lucide.min.js']);

  panel.webview.html = getProjectFormWebviewContent(vrcList, lucideUri, existingProject);

  return new Promise((resolve) => {
    panel.webview.onDidReceiveMessage((message) => {
      if (message.command === "save") {
        resolve({
          name: message.name,
          pmc: message.pmc,
          jiraId: message.jiraId,
          vrc: message.vrc,
          role: message.role,
          createdAt: existingProject?.createdAt || Date.now(),
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

function getProjectFormWebviewContent(
  vrcList: string[],
  lucideUri: vscode.Uri,
  existingProject?: Project,
): string {
  const vrcOptionsJson = JSON.stringify(vrcList);
  const isEdit = !!existingProject;

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

        input.invalid, select.invalid {
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
        
        input, select {
            width: 100%;
            padding: 12px 12px 12px 40px;
            background: var(--input-bg);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: var(--radius);
            font-size: 14px;
            transition: all 0.2s;
        }

        input:focus, select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px rgba(var(--vscode-focusBorder), 0.1);
        }

        input:disabled {
            opacity: 0.5;
            cursor: not-allowed;
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
        .btn-save { background: var(--accent); color: var(--vscode-button-foreground); }
        .btn-cancel { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        button:hover { filter: brightness(1.1); }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="form-container">
        <div class="heading-group">
            <h1>${isEdit ? 'Edit Project' : 'New Project'}</h1>
            <p class="desc">Define project information and configuration.</p>
        </div>

        <form id="projectForm">
            <div class="form-grid">
                <div class="form-item">
                    <label>Project Name</label>
                    <div class="input-wrapper">
                        <i data-lucide="folder" class="input-icon"></i>
                        <input type="text" id="projectName" placeholder="e.g. 300003" value="${existingProject?.name || ''}" ${isEdit ? 'disabled' : ''}>
                    </div>
                    <div class="error-label" id="err-projectName">Project name is required</div>
                </div>

                <div class="form-item">
                    <label>PMC Number</label>
                    <div class="input-wrapper">
                        <i data-lucide="hash" class="input-icon"></i>
                        <input type="text" id="pmc" placeholder="e.g. 12345" value="${existingProject?.pmc || ''}">
                    </div>
                    <div class="error-label" id="err-pmc">PMC number is required</div>
                </div>

                <div class="form-item">
                    <label>JIRA ID</label>
                    <div class="input-wrapper">
                        <i data-lucide="tag" class="input-icon"></i>
                        <input type="text" id="jiraId" placeholder="e.g. EDM-2222" value="${existingProject?.jiraId || ''}">
                    </div>
                    <div class="error-label" id="err-jiraId">JIRA ID is required</div>
                </div>

                <div class="form-item">
                    <label>VRC</label>
                    <div class="dropdown-wrapper">
                        <div class="input-wrapper">
                            <i data-lucide="git-branch" class="input-icon"></i>
                            <input type="text" id="vrcInput" placeholder="Search or type VRC..." value="${existingProject?.vrc || ''}" autocomplete="off">
                        </div>
                        <div id="vrcList" class="options-list"></div>
                    </div>
                    <div class="error-label" id="err-vrc">VRC is required</div>
                </div>

                <div class="form-item">
                    <label>Role</label>
                    <div class="input-wrapper">
                        <i data-lucide="user-check" class="input-icon"></i>
                        <select id="role">
                            <option value="">Select Role</option>
                            <option value="Developer" ${existingProject?.role === 'Developer' ? 'selected' : ''}>Developer</option>
                            <option value="Reviewer" ${existingProject?.role === 'Reviewer' ? 'selected' : ''}>Reviewer</option>
                        </select>
                    </div>
                    <div class="error-label" id="err-role">Role is required</div>
                </div>
            </div>

            <div class="actions">
                <button type="submit" class="btn-save">${isEdit ? 'Update' : 'Create'} Project</button>
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

        // Searchable Dropdown Logic
        vrcInput.addEventListener('input', () => {
            vrcInput.classList.remove('invalid');
            const val = vrcInput.value.toLowerCase();
            const filtered = vrcListSource.filter(item => item.toLowerCase().includes(val));
            renderDropdown(filtered);
            vrcDropdown.style.display = filtered.length ? 'block' : 'none';
        });

        // Clear invalid state on input
        ['projectName', 'pmc', 'jiraId', 'role'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => e.target.classList.remove('invalid'));
            }
        });

        vrcInput.addEventListener('focus', () => {
            if(vrcListSource.length) {
                renderDropdown(vrcListSource);
                vrcDropdown.style.display = 'block';
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-wrapper')) vrcDropdown.style.display = 'none';
        });

        function renderDropdown(list) {
            vrcDropdown.innerHTML = list.map(item => \`<div class="option-item">\${item}</div>\`).join('');
            vrcDropdown.querySelectorAll('.option-item').forEach(el => {
                el.onclick = () => {
                    vrcInput.value = el.textContent;
                    vrcInput.classList.remove('invalid');
                    vrcDropdown.style.display = 'none';
                };
            });
        }

        // Validation & Submit
        document.getElementById('projectForm').onsubmit = (e) => {
            e.preventDefault();
            let valid = true;
            
            const fields = [
                { id: 'projectName', errId: 'err-projectName' },
                { id: 'pmc', errId: 'err-pmc' },
                { id: 'jiraId', errId: 'err-jiraId' },
                { id: 'vrcInput', errId: 'err-vrc' },
                { id: 'role', errId: 'err-role' }
            ];

            fields.forEach(field => {
                const el = document.getElementById(field.id);
                const err = document.getElementById(field.errId);
                
                if(!el.value.trim()) {
                    err.classList.add('visible');
                    el.classList.add('invalid');
                    valid = false;
                } else {
                    if (field.id === 'vrcInput' && vrcListSource.length && !vrcListSource.includes(el.value.trim())) {
                        err.textContent = 'Please select a valid VRC from the list';
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
                    command: 'save',
                    name: document.getElementById('projectName').value,
                    pmc: document.getElementById('pmc').value,
                    jiraId: document.getElementById('jiraId').value,
                    vrc: vrcInput.value,
                    role: document.getElementById('role').value
                });
            }
        };

        document.getElementById('cancelBtn').onclick = () => vscode.postMessage({ command: 'cancel' });
    </script>
</body>
</html>`;
}
