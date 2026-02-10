import * as vscode from "vscode";
import { getLocalResource } from "../../utils/webview-helpers";

/**
 * Login form data interface
 */
export interface LoginFormData {
  username: string;
  password: string;
}

/**
 * Shows the login form webview
 * @param context - The VS Code extension context
 * @param onLogin - Callback function that returns true if login succeeds, false with error message if it fails
 * @param initialError - Optional initial error message to display
 * @returns Promise resolving to login form data when successful
 */
export async function showLoginForm(
  context: vscode.ExtensionContext,
  onLogin: (
    username: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>,
  initialError?: string,
): Promise<LoginFormData> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "erpLogin",
      "ERP DevTools - Login",
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

    panel.webview.html = getLoginFormHtml(lucideUri, initialError);

    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "submit":
            // Try to login
            const result = await onLogin(message.username, message.password);

            if (result.success) {
              // Login successful - resolve and close webview
              resolve({
                username: message.username,
                password: message.password,
              });
              panel.dispose();
            } else {
              // Login failed - update webview to show error
              panel.webview.postMessage({
                command: "loginFailed",
                error: result.error || "Invalid credentials. Please try again.",
              });
            }
            break;
        }
      },
      undefined,
      context.subscriptions,
    );

    panel.onDidDispose(() => {
      // If panel is disposed without successful login, resolve with empty credentials
      // This allows extension to continue functioning
      resolve({
        username: "",
        password: "",
      });
    });
  });
}

/**
 * Generates the HTML for the login form
 */
function getLoginFormHtml(
  lucideUri: vscode.Uri,
  errorMessage?: string,
): string {
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
            --input-border: var(--vscode-input-border);
            --button-bg: var(--vscode-button-background);
            --button-fg: var(--vscode-button-foreground);
            --button-hover: var(--vscode-button-hoverBackground);
            --error-fg: var(--vscode-errorForeground);
            --font: var(--vscode-font-family, 'Segoe UI', sans-serif);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--font);
            background-color: var(--bg);
            color: var(--fg);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
        }

        .login-container {
            width: 100%;
            max-width: 400px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 32px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .logo-section {
            text-align: center;
            margin-bottom: 32px;
        }

        .logo-icon {
            width: 64px;
            height: 64px;
            color: var(--vscode-charts-blue);
            margin-bottom: 16px;
        }

        .logo-section h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .logo-section p {
            font-size: 14px;
            opacity: 0.7;
        }

        .error-message {
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--error-fg);
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
        }

        .error-message i {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-size: 13px;
            font-weight: 500;
            opacity: 0.9;
        }

        .form-group input {
            width: 100%;
            padding: 10px 12px;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 6px;
            color: var(--fg);
            font-size: 14px;
            font-family: var(--font);
            transition: all 0.2s;
        }

        .form-group input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        .form-actions {
            display: flex;
            gap: 10px;
            margin-top: 24px;
        }

        .btn {
            flex: 1;
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            font-family: var(--font);
        }

        .btn-primary {
            background: var(--button-bg);
            color: var(--button-fg);
        }

        .btn-primary:hover {
            background: var(--button-hover);
        }

        .btn-secondary {
            background: transparent;
            color: var(--fg);
            border: 1px solid var(--border);
        }

        .btn-secondary:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .btn:active {
            transform: scale(0.98);
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .info-text {
            margin-top: 20px;
            padding: 12px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-charts-blue);
            border-radius: 4px;
            font-size: 12px;
            opacity: 0.8;
        }

        .warning-text {
            margin-top: 16px;
            padding: 12px;
            background: var(--vscode-inputValidation-warningBackground);
            border-left: 3px solid var(--vscode-inputValidation-warningBorder);
            border-radius: 4px;
            font-size: 12px;
            opacity: 0.9;
            color: var(--vscode-foreground);
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo-section">
            <i data-lucide="shield-check" class="logo-icon"></i>
            <h1>ERP DevTools Login</h1>
            <p>Enter your ERP credentials to continue</p>
        </div>

        ${
          errorMessage
            ? `
        <div class="error-message">
            <i data-lucide="alert-circle"></i>
            <span>${errorMessage}</span>
        </div>
        `
            : ""
        }

        <form id="loginForm">
            <div class="form-group">
                <label for="username">Username</label>
                <input 
                    type="text" 
                    id="username" 
                    name="username" 
                    required 
                    autofocus
                    autocomplete="username"
                    placeholder="Enter your username"
                />
            </div>

            <div class="form-group">
                <label for="password">Password</label>
                <input 
                    type="password" 
                    id="password" 
                    name="password" 
                    required
                    autocomplete="current-password"
                    placeholder="Enter your password"
                />
            </div>

            <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="loginBtn" style="width: 100%;">
                    Login
                </button>
            </div>
        </form>

        <div class="info-text">
            <strong>Note:</strong> Your credentials are stored securely and will be used for all ERP API requests.
        </div>

        <div class="warning-text">
            <strong>Authentication Required:</strong> You must login to use ERP DevTools features. If you close this window without logging in, the extension will load with limited functionality.
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        lucide.createIcons();

        const form = document.getElementById('loginForm');
        const loginBtn = document.getElementById('loginBtn');
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.command === 'loginFailed') {
                // Show error message
                showError(message.error);
                
                // Re-enable form
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login';
            }
        });

        function showError(errorText) {
            // Remove existing error if any
            const existingError = document.querySelector('.error-message');
            if (existingError) {
                existingError.remove();
            }

            // Create new error message
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.innerHTML = \`
                <i data-lucide="alert-circle"></i>
                <span>\${errorText}</span>
            \`;

            // Insert after logo section
            const logoSection = document.querySelector('.logo-section');
            logoSection.insertAdjacentElement('afterend', errorDiv);

            // Re-initialize icons
            lucide.createIcons();
        }

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!username || !password) {
                showError('Please enter both username and password.');
                return;
            }

            // Disable button and show loading state
            loginBtn.disabled = true;
            loginBtn.textContent = 'Logging in...';

            vscode.postMessage({
                command: 'submit',
                username: username,
                password: password
            });
        });
    </script>
</body>
</html>`;
}
