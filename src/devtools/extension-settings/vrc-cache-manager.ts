import * as erpService from "../services/erp-service";

/**
 * Manages VRC (Version Release Customer) caching by environment
 */
export class VRCCacheManager {
  private cache: Map<string, string[]> = new Map();

  /**
   * Fetches VRC list for an environment, using cache when available
   *
   * @param environment - The environment name
   * @param serverUrl - The backend server URL
   * @param username - The ERP username for authentication
   * @param password - The ERP password for authentication
   * @param pmc - Optional PMC number to filter VRCs
   * @returns Promise resolving to array of VRC strings
   */
  async fetchVRCList(
    environment: string,
    serverUrl: string,
    creds: { username: string; password: string },
    pmc?: string,
  ): Promise<string[]> {
    // If no PMC and cache exists for this environment, return cached data
    if (!pmc && this.cache.has(environment)) {
      return this.cache.get(environment)!;
    }

    if (!serverUrl) {
      console.warn("No backend URL found for environment:", environment);
      return [];
    }

    try {
      const vrcs = await erpService.fetchVRCs(serverUrl, creds, pmc);
      // Only cache if no PMC was provided (general VRC list)
      if (!pmc && vrcs.length > 0) {
        this.cache.set(environment, vrcs);
      }
      return vrcs;
    } catch (err) {
      console.warn("Failed to fetch VRCs from server");
    }
    return [];
  }

  /**
   * Clears the VRC cache for all environments
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clears the VRC cache for a specific environment
   *
   * @param environment - The environment name
   */
  clearCacheForEnvironment(environment: string): void {
    this.cache.delete(environment);
  }
}
