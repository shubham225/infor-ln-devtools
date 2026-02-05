import * as vscode from "vscode";

/**
 * Authentication credentials interface
 */
export interface AuthCredentials {
  username: string;
  password: string;
}

/**
 * Manages authentication credentials for ERP integration
 */
export class AuthManager {
  private static readonly STORAGE_KEY = "erp.auth.credentials";
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Store authentication credentials securely
   * @param username - The username
   * @param password - The password
   */
  async storeCredentials(username: string, password: string): Promise<void> {
    await this.context.secrets.store(
      AuthManager.STORAGE_KEY,
      JSON.stringify({ username, password }),
    );
  }

  /**
   * Retrieve stored authentication credentials
   * @returns The stored credentials or null if not found
   */
  async getCredentials(): Promise<AuthCredentials | null> {
    const stored = await this.context.secrets.get(AuthManager.STORAGE_KEY);
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored) as AuthCredentials;
    } catch (error) {
      console.error("Failed to parse stored credentials:", error);
      return null;
    }
  }

  /**
   * Check if credentials are stored
   * @returns True if credentials exist
   */
  async hasCredentials(): Promise<boolean> {
    const creds = await this.getCredentials();
    return creds !== null;
  }

  /**
   * Clear stored credentials
   */
  async clearCredentials(): Promise<void> {
    await this.context.secrets.delete(AuthManager.STORAGE_KEY);
  }
}
