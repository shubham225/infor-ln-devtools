import * as vscode from "vscode";
import type { Project } from "../../types";
import { UPDATE_MODE } from "../../types";
import { getLocalResource } from "../../utils/webview-helpers";

export async function showProjectForm(
  context: vscode.ExtensionContext,
  updateMode: UPDATE_MODE,
  vrcList: string[] = [],
  environments: string[] = [],
  existingProject?: Project,
  fetchVRCsCallback?: (pmc: string, environment: string) => Promise<string[]>,
  validateCallback?: (project: Project) => Promise<{ valid: boolean; errorMessage?: string; warningMessage?: string }>,
): Promise<Project | null> {
  const title = (
    {
      CREATE: "New Project",
      UPDATE: "Edit Project",
      DELETE: "Delete Project",
      IMPORT: "Import Project",
    } as const
  )[updateMode];

  const panel = vscode.window.createWebviewPanel(
    "projectForm",
    title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  const lucideUri = getLocalResource(panel.webview, context.extensionUri, [
    "resources",
    "lucide.min.js",
  ]);

  panel.webview.html = getProjectFormWebviewContent(
    title,
    updateMode,
    vrcList,
    environments,
    lucideUri,
    existingProject,
  );

  return new Promise((resolve) => {
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "save") {
        const project: Project = {
          name: message.name,
          pmc: message.pmc,
          jiraId: message.jiraId,
          vrc: message.vrc,
          role: message.role,
          environment: message.environment,
          createdAt: existingProject?.createdAt || Date.now(),
        };

        const isBlank = (value?: string) => !value || value.trim().length === 0;

        // If validateCallback is provided, validate the project
        if (validateCallback && !(project.role === 'Developer' && isBlank(project.pmc))) {
          try {
            const validation = await validateCallback(project);
            
            // Handle different validation outcomes
            if (validation.errorMessage) {
              // Error case: show error and close without saving
              panel.webview.postMessage({
                command: "validationResult",
                valid: false,
                errorMessage: validation.errorMessage,
              });
              vscode.window.showErrorMessage(validation.errorMessage);
              // Don't resolve/dispose here - let webview handle showing error and closing
            } else if (validation.warningMessage) {
              // Warning case: show warning dialog with continue/modify options
              panel.webview.postMessage({
                command: "validationResult",
                valid: true,
                warningMessage: validation.warningMessage,
              });
              // Don't resolve/dispose here - let webview handle user's choice
            } else if (validation.valid) {
              // Success case: no errors or warnings, save and close
              resolve(project);
              panel.dispose();
            } else {
              // Validation failed but no error message provided
              panel.webview.postMessage({
                command: "validationResult",
                valid: false,
                errorMessage: "Validation failed. Please check your input.",
              });
              vscode.window.showErrorMessage("Project validation failed. Please check the details.");
            }
          } catch (error: any) {
            // Exception during validation: send error back to webview
            panel.webview.postMessage({
              command: "validationResult",
              valid: false,
              errorMessage: error.message || "Validation failed",
            });
              vscode.window.showErrorMessage(error.message);
          }
        } else {
          // No validation callback, just save directly
          resolve(project);
          panel.dispose();
        }
      } else if (message.command === "continueAfterWarning") {
        // User clicked "Continue" on warning dialog
        resolve({
          name: message.name,
          pmc: message.pmc,
          jiraId: message.jiraId,
          vrc: message.vrc,
          role: message.role,
          environment: message.environment,
          createdAt: existingProject?.createdAt || Date.now(),
        });
        panel.dispose();
      } else if (message.command === "cancel") {
        resolve(null);
        panel.dispose();
      } else if (message.command === "fetchVRCs" && fetchVRCsCallback) {
        // Fetch VRCs based on PMC and Environment
        const vrcs = await fetchVRCsCallback(message.pmc, message.environment);
        panel.webview.postMessage({
          command: "updateVRCs",
          vrcs: vrcs,
        });
      }
    });

    panel.onDidDispose(() => resolve(null));
  });
}

function getProjectFormWebviewContent(
  title: string,
  updateMode: UPDATE_MODE,
  vrcList: string[],
  environments: string[],
  lucideUri: vscode.Uri,
  existingProject?: Project,
): string {
  const vrcOptionsJson = JSON.stringify(vrcList);
  const environmentsJson = JSON.stringify(environments);
  const isEdit = updateMode === "UPDATE" || updateMode === "DELETE" || updateMode === "IMPORT";

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

        /* Modal styles for warning dialog */
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
            padding: 24px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        }

        .modal-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
        }

        .modal-icon {
            width: 24px;
            height: 24px;
            color: var(--vscode-notificationsWarningIcon-foreground);
        }

        .modal-title {
            font-size: 18px;
            font-weight: 600;
        }

        .modal-body {
            margin-bottom: 20px;
            line-height: 1.6;
            color: var(--fg);
        }

        .modal-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        }

        .btn-continue {
            background: var(--accent);
            color: var(--vscode-button-foreground);
        }

        .btn-modify {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="form-container">
        <div class="heading-group">
            <h1>${title}</h1>
            <p class="desc">Define project information and configuration.</p>
        </div>

        <form id="projectForm">
            <div class="form-grid">
                <div class="form-item">
                    <label>Project Name</label>
                    <div class="input-wrapper">
                        <i data-lucide="folder" class="input-icon"></i>
                        <input type="text" id="projectName" placeholder="e.g. 300003" value="${existingProject?.name || ""}" ${isEdit ? "disabled" : ""}>
                    </div>
                    <div class="error-label" id="err-projectName">Project name is required</div>
                </div>

                <div class="form-item">
                    <label>Role</label>
                    <div class="dropdown-wrapper">
                        <div class="input-wrapper">
                            <i data-lucide="user-check" class="input-icon"></i>
                            <input type="text" id="roleInput" placeholder="Search or select role..." value="${existingProject?.role || ""}" autocomplete="off">
                        </div>
                        <div id="roleList" class="options-list"></div>
                    </div>
                    <div class="error-label" id="err-role">Role is required</div>
                </div>

                <div class="form-item">
                    <label>Environment</label>
                    <div class="dropdown-wrapper">
                        <div class="input-wrapper">
                            <i data-lucide="server" class="input-icon"></i>
                            <input type="text" id="environmentInput" placeholder="Search or select environment..." value="${existingProject?.environment || ""}" autocomplete="off">
                        </div>
                        <div id="environmentList" class="options-list"></div>
                    </div>
                    <div class="error-label" id="err-environment">Environment is required</div>
                </div>

                <div class="form-item">
                    <label>PMC Number</label>
                    <div class="input-wrapper">
                        <i data-lucide="hash" class="input-icon"></i>
                        <input type="text" id="pmc" placeholder="e.g. 12345" value="${existingProject?.pmc || ""}">
                    </div>
                    <div class="error-label" id="err-pmc">PMC number is required</div>
                </div>

                <div class="form-item">
                    <label>Ticket ID</label>
                    <div class="input-wrapper">
                        <i data-lucide="tag" class="input-icon"></i>
                        <input type="text" id="jiraId" placeholder="e.g. ABC56278" value="${existingProject?.jiraId || ""}">
                    </div>
                    <div class="error-label" id="err-jiraId">JIRA ID is required</div>
                </div>

                <div class="form-item">
                    <label>VRC</label>
                    <div class="dropdown-wrapper">
                        <div class="input-wrapper">
                            <i data-lucide="git-branch" class="input-icon"></i>
                            <input type="text" id="vrcInput" placeholder="Search or type VRC..." value="${existingProject?.vrc || ""}" autocomplete="off">
                        </div>
                        <div id="vrcList" class="options-list"></div>
                    </div>
                    <div class="error-label" id="err-vrc">VRC is required</div>
                </div>
            </div>

            <div class="actions">
                <button type="submit" class="btn-save">${isEdit ? "Update" : "Create"} Project</button>
                <button type="button" id="cancelBtn" class="btn-cancel">Cancel</button>
            </div>
        </form>
    </div>

    <!-- Warning Dialog Modal -->
    <div id="warningModal" class="modal-overlay">
        <div class="modal-content">
            <div class="modal-header">
                <i data-lucide="alert-triangle" class="modal-icon"></i>
                <div class="modal-title">Warning</div>
            </div>
            <div class="modal-body" id="warningMessage">
                <!-- Warning message will be inserted here -->
            </div>
            <div class="modal-actions">
                <button type="button" class="btn-modify" id="modifyBtn">
                    <i data-lucide="edit" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>
                    Modify Project
                </button>
                <button type="button" class="btn-continue" id="continueBtn">
                    <i data-lucide="check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>
                    Continue
                </button>
            </div>
        </div>
    </div>

    <script>
        lucide.createIcons();
        const vscode = acquireVsCodeApi();
        let vrcListSource = ${vrcOptionsJson};
        const environmentsSource = ${environmentsJson};
        const isEdit = ${isEdit};
        
        const vrcInput = document.getElementById('vrcInput');
        const vrcDropdown = document.getElementById('vrcList');
        const environmentInput = document.getElementById('environmentInput');
        const environmentDropdown = document.getElementById('environmentList');
        const roleInput = document.getElementById('roleInput');
        const roleDropdown = document.getElementById('roleList');
        const pmcInput = document.getElementById('pmc');
        const jiraIdInput = document.getElementById('jiraId');
        const rolesSource = ['Developer', 'Reviewer'];
        const warningModal = document.getElementById('warningModal');
        const warningMessageDiv = document.getElementById('warningMessage');
        
        let currentFormData = null; // Store form data when showing warning

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateVRCs') {
                vrcListSource = message.vrcs;
                // Automatically show dropdown if VRCs are loaded and input is focused
                if (vrcListSource.length > 0 && document.activeElement === vrcInput) {
                    renderDropdown(vrcDropdown, vrcListSource, vrcInput);
                    vrcDropdown.style.display = 'block';
                }
            } else if (message.command === 'validationResult') {
                // Handle validation result
                if (!message.valid && message.errorMessage) {
                    // Show error message and close form without saving
                    alert('Validation Error: ' + message.errorMessage);
                    // Close the form after user acknowledges the error
                    vscode.postMessage({ command: 'cancel' });
                } else if (message.valid && message.warningMessage) {
                    // Show warning dialog with Continue and Modify options
                    warningMessageDiv.textContent = message.warningMessage;
                    warningModal.classList.add('show');
                    lucide.createIcons(); // Re-create icons for modal
                } else if (message.valid && !message.warningMessage && !message.errorMessage) {
                    // Success - form will close automatically from backend
                    // No action needed here as backend handles resolve and dispose
                }
            }
        });

        // Handle Continue button in warning dialog
        document.getElementById('continueBtn').addEventListener('click', () => {
            warningModal.classList.remove('show');
            if (currentFormData) {
                vscode.postMessage({
                    command: 'continueAfterWarning',
                    ...currentFormData
                });
            }
        });

        // Handle Modify button in warning dialog
        document.getElementById('modifyBtn').addEventListener('click', () => {
            warningModal.classList.remove('show');
            // Just close the modal, keep form open for editing
        });

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && warningModal.classList.contains('show')) {
                warningModal.classList.remove('show');
            }
        });

        // Fetch VRCs when PMC is entered and user moves away
        pmcInput.addEventListener('focusout', () => {
            const pmcValue = pmcInput.value.trim();
            const envValue = environmentInput.value.trim();
            if (pmcValue && envValue) {
                vscode.postMessage({
                    command: 'fetchVRCs',
                    pmc: pmcValue,
                    environment: envValue
                });
            }
        });

        // Searchable Dropdown Logic for VRC
        vrcInput.addEventListener('input', () => {
            vrcInput.classList.remove('invalid');
            const val = vrcInput.value.toLowerCase();
            const filtered = vrcListSource.filter(item => item.toLowerCase().includes(val));
            renderDropdown(vrcDropdown, filtered, vrcInput);
            vrcDropdown.style.display = filtered.length ? 'block' : 'none';
        });

        // Searchable Dropdown Logic for Environment
        environmentInput.addEventListener('input', () => {
            environmentInput.classList.remove('invalid');
            const val = environmentInput.value.toLowerCase();
            const filtered = environmentsSource.filter(item => item.toLowerCase().includes(val));
            renderDropdown(environmentDropdown, filtered, environmentInput);
            environmentDropdown.style.display = filtered.length ? 'block' : 'none';
        });

        // Searchable Dropdown Logic for Role
        roleInput.addEventListener('input', () => {
            roleInput.classList.remove('invalid');
            const val = roleInput.value.toLowerCase();
            const filtered = rolesSource.filter(item => item.toLowerCase().includes(val));
            renderDropdown(roleDropdown, filtered, roleInput);
            roleDropdown.style.display = filtered.length ? 'block' : 'none';
        });

        roleInput.addEventListener('focus', () => {
            if(rolesSource.length) {
                renderDropdown(roleDropdown, rolesSource, roleInput);
                roleDropdown.style.display = 'block';
            }
        });

        // Clear invalid state on input
        ['projectName', 'pmc', 'jiraId'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => e.target.classList.remove('invalid'));
            }
        });

        vrcInput.addEventListener('focus', () => {
            if(vrcListSource.length) {
                renderDropdown(vrcDropdown, vrcListSource, vrcInput);
                vrcDropdown.style.display = 'block';
            }
        });

        environmentInput.addEventListener('focus', () => {
            if(environmentsSource.length) {
                renderDropdown(environmentDropdown, environmentsSource, environmentInput);
                environmentDropdown.style.display = 'block';
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-wrapper')) {
                vrcDropdown.style.display = 'none';
                environmentDropdown.style.display = 'none';
                roleDropdown.style.display = 'none';
            }
        });

        function renderDropdown(dropdown, list, input) {
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
        document.getElementById('projectForm').onsubmit = (e) => {
            e.preventDefault();
            let valid = true;
            
            const selectedRole = roleInput.value.trim();
            const isDeveloper = selectedRole === 'Developer';
            
            const fields = [
                { id: 'projectName', errId: 'err-projectName', required: true, maxLength: 26 },
                { id: 'environmentInput', errId: 'err-environment', list: environmentsSource, required: true },
                { id: 'pmc', errId: 'err-pmc', required: !isDeveloper, maxLength: 26 },
                { id: 'jiraId', errId: 'err-jiraId', required: !isDeveloper, maxLength: 11 },
                { id: 'vrcInput', errId: 'err-vrc', list: vrcListSource, required: true },
                { id: 'roleInput', errId: 'err-role', list: rolesSource, required: true }
            ];

            fields.forEach(field => {
                const el = document.getElementById(field.id);
                const err = document.getElementById(field.errId);
                const value = el.value.trim();
                
                if(field.required && !value) {
                    err.textContent = field.id === 'projectName' ? 'Project name is required' :
                                     field.id === 'pmc' ? 'PMC number is required' :
                                     field.id === 'jiraId' ? 'JIRA ID is required' :
                                     field.id === 'vrcInput' ? 'VRC is required' :
                                     field.id === 'roleInput' ? 'Role is required' :
                                     field.id === 'environmentInput' ? 'Environment is required' : 'This field is required';
                    err.classList.add('visible');
                    el.classList.add('invalid');
                    valid = false;
                } else if (!value) {
                    // Not required and empty - clear errors
                    err.classList.remove('visible');
                    el.classList.remove('invalid');
                } else {
                    // Check max length
                    if (field.maxLength && value.length > field.maxLength) {
                        err.textContent = \`Maximum length is \${field.maxLength} characters\`;
                        err.classList.add('visible');
                        el.classList.add('invalid');
                        valid = false;
                    } else if (field.list && field.list.length && !field.list.includes(value)) {
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
                // Store form data for potential "Continue" action
                currentFormData = {
                    name: document.getElementById('projectName').value,
                    environment: environmentInput.value,
                    pmc: document.getElementById('pmc').value,
                    jiraId: document.getElementById('jiraId').value,
                    vrc: vrcInput.value,
                    role: roleInput.value
                };
                
                vscode.postMessage({
                    command: 'save',
                    ...currentFormData
                });
            }
        };

        document.getElementById('cancelBtn').onclick = () => vscode.postMessage({ command: 'cancel' });
    </script>
</body>
</html>`;
}
