import * as vscode from "vscode";
import * as os from "os";

export interface ConfigSettings {
  serverUrl: string;
  vrc: string;
}

// Add this helper to the top of your file
function getLocalResource(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]) {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}

export async function showConfigurationForm(
  context: vscode.ExtensionContext,
  currentSettings: ConfigSettings,
  vrcList: string[] = [],
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

  // Try to get Cursor logged-in user (usually via GitHub or Microsoft provider), cursor doesn't provide an api to fetch user details.
  //   const isCursor = vscode.env.appName.toLowerCase().includes("cursor");
  //   if (isCursor) {
  //     try {
  //       const session =
  //         (await vscode.authentication.getSession("github", ["user:email"], {
  //           silent: true,
  //         })) ||
  //         (await vscode.authentication.getSession("microsoft", ["user:email"], {
  //           silent: true,
  //         }));

  //       if (session) {
  //         userName = session.account.label;
  //       }
  //     } catch (e) {
  //       console.warn("Could not retrieve Cursor session:", e);
  //     }
  //   }

  // Get the local path to lucide.js (assuming it's in a 'media' folder)
  const lucideUri = getLocalResource(panel.webview, context.extensionUri, ['resources', 'lucide.min.js']);

  panel.webview.html = getWebviewContent(currentSettings, vrcList, userName, lucideUri);

  return new Promise((resolve) => {
    panel.webview.onDidReceiveMessage((message) => {
      if (message.command === "save") {
        resolve({
          serverUrl: message.serverUrl,
          vrc: message.vrc,
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
  vrcList: string[],
  userName: string,
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
                    <label>Backend API URL (C4WS)</label>
                    <div class="input-wrapper">
                        <i data-lucide="globe" class="input-icon"></i>
                        <input type="text" id="serverUrl" value="${settings.serverUrl}" placeholder="https://api.yourdomain.com:8312/c4ws/services/BDEName/ERP_SERVER">
                    </div>
                    <div class="error-label" id="err-serverUrl">Invalid API URL</div>
                </div>

                <div class="form-item">
                    <label>Base VRC</label>
                    <div class="dropdown-wrapper">
                        <div class="input-wrapper">
                            <i data-lucide="git-branch" class="input-icon"></i>
                            <input type="text" id="vrcInput" placeholder="Search or type VRC..." value="${settings.vrc}" autocomplete="off">
                        </div>
                        <div id="vrcList" class="options-list"></div>
                    </div>
                    <div class="error-label" id="err-vrc">Base VRC is required</div>
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
        const vrcListSource = ${vrcOptionsJson};
        
        const vrcInput = document.getElementById('vrcInput');
        const vrcDropdown = document.getElementById('vrcList');

        // Searchable Dropdown Logic
        vrcInput.addEventListener('input', () => {
            vrcInput.classList.remove('invalid'); // Clear ring on type
            const val = vrcInput.value.toLowerCase();
            const filtered = vrcListSource.filter(item => item.toLowerCase().includes(val));
            renderDropdown(filtered);
            vrcDropdown.style.display = filtered.length ? 'block' : 'none';
        });

        // Add clear logic for other inputs
        document.getElementById('serverUrl').addEventListener('input', (e) => e.target.classList.remove('invalid'));

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
        document.getElementById('configForm').onsubmit = (e) => {
            e.preventDefault();
            let valid = true;
            ['serverUrl', 'vrcInput'].forEach(id => {
                const el = document.getElementById(id);
                const err = document.getElementById('err-' + id.replace('Input',''));
                if(!el.value.trim()) {
                    err.classList.add('visible');
                    el.classList.add('invalid'); // ADDED RED RING
                    valid = false;
                } else {
                    if (id === 'vrcInput' && vrcListSource.length && !vrcListSource.includes(el.value.trim())) {
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
                    serverUrl: document.getElementById('serverUrl').value,
                    vrc: vrcInput.value
                });
            }
        };

        document.getElementById('cancelBtn').onclick = () => vscode.postMessage({ command: 'cancel' });
    </script>
</body>
</html>`;
}
