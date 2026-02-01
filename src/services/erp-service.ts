import { apiClient } from "../utils/api-client";
import * as os from "os";
import AdmZip from "adm-zip";
import type {
  Component,
  FetchModulesResponse,
  FetchComponentsResponse,
  ValidateProjectResponse,
  DownloadComponentsResponse,
  DownloadComponentsByPMCResponse,
  CloseProjectResponse,
  UploadScriptResponse,
  CompileScriptResponse,
  HealthCheckResponse,
} from "../types/api";

/**
 * Health check to verify ERP connection and credentials
 */
export async function healthCheck(
  serverUrl: string,
  username: string,
  password: string,
): Promise<HealthCheckResponse> {
  const data = await apiClient.get<HealthCheckResponse>(`${serverUrl}/health`, {
    auth: { username, password },
  });

  return {
    status: data.status,
    username: data.username,
  };
}

/**
 * Fetch VRCs from ERP
 */
export async function fetchVRCs(
  serverUrl: string,
  username: string,
  password: string,
  pmc?: string,
): Promise<string[]> {
  const requestBody: Record<string, any> = {};
  if (pmc) {
    requestBody.pmc = pmc;
  }

  const url = pmc ? `${serverUrl}/pmc/${encodeURIComponent(pmc)}/vrc` : `${serverUrl}/vrc`;
  const data = await apiClient.get<string[] | { vrcs: string[] }>(url, { auth: { username, password } });

  // support both legacy { vrcs: [...] } and plain string[] responses
  if (Array.isArray(data)) {
    return data as string[];
  }
  if (data && Array.isArray((data as any).vrcs)) {
    return (data as any).vrcs;
  }

  return [];
}

/**
 * Fetch modules from ERP
 */
export async function fetchModules(
  serverUrl: string,
  vrc: string,
  username: string,
  password: string,
): Promise<FetchModulesResponse> {
  const data = await apiClient.post<FetchModulesResponse>(`${serverUrl}/packageModules`, { vrc }, { auth: { username, password } });

  return data as FetchModulesResponse;
}

/**
 * Fetch components for a specific module
 */
export async function fetchComponents(
  serverUrl: string,
  type: string,
  pkg: string,
  module: string,
  vrc: string,
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<FetchComponentsResponse> {
  const data = await apiClient.post<FetchComponentsResponse>(`${serverUrl}/component`, {
      type,
      package: pkg,
      module,
      vrc,
    }, { auth: { username, password }, signal });

  return data as FetchComponentsResponse;
}

/**
 * Validate project with ERP
 */
export async function validateProject(
  serverUrl: string,
  vrc: string,
  projectName: string,
  pmc: string,
  jiraId: string,
  role: string,
  username: string,
  password: string,
): Promise<ValidateProjectResponse> {
  const data = await apiClient.post<ValidateProjectResponse>(`${serverUrl}/validate`, {
      vrc,
      projectName,
      pmc,
      jiraID: jiraId,
      role: role.toLowerCase(),
    }, { auth: { username, password } });

  return {
    valid: data.valid,
    errorMessage: data.errorMessage,
    warningMessage: data.warningMessage,
  };
}

/**
 * Download components from ERP
 */
export async function downloadComponents(
  serverUrl: string,
  vrc: string,
  projectName: string,
  pmc: string,
  components: Component[],
  role: string,
  jiraId: string,
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<DownloadComponentsResponse> {
  const data = await apiClient.download(`${serverUrl}/component/download`, {
      vrc,
      importFolder: projectName,
      projectName,
      pmc,
      components,
      username: os.userInfo().username,
      role: role.toLowerCase(),
      jiraID: jiraId,
    }, { auth: { username, password }, signal });

  return data as DownloadComponentsResponse;
}

/**
 * Download components by PMC from ERP
 */
export async function downloadComponentsByPMC(
  serverUrl: string,
  pmc: string,
  vrc: string,
  projectName: string,
  role: string,
  jiraId: string,
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<DownloadComponentsByPMCResponse> {
  const data = await apiClient.download(`${serverUrl}/pmc/${encodeURIComponent(pmc)}/download`, {
      vrc,
      projectName,
      username: os.userInfo().username,
      role: role.toLowerCase(),
      jiraID: jiraId,
    }, { auth: { username, password }, signal });

  return data as DownloadComponentsByPMCResponse;
}

/**
 * Close project on ERP
 */
export async function closeProject(
  serverUrl: string,
  pmc: string,
  vrc: string,
  projectName: string,
  role: string,
  jiraId: string,
  username: string,
  password: string,
): Promise<CloseProjectResponse> {
  const data = await apiClient.post<CloseProjectResponse>(`${serverUrl}/project/close`, {
      pmc,
      vrc,
      projectName,
      role: role.toLowerCase(),
      jiraID: jiraId,
      username: os.userInfo().username,
    }, { auth: { username, password } });

  return {
    success: data.success,
    errorMessage: data.errorMessage,
  };
}

/**
 * Upload script to ERP (sends base64 of ZIP of .bc file)
 */
export async function uploadScript(
  serverUrl: string,
  scriptName: string,
  bcFileContent: string,
  vrc: string,
  projectName: string,
  pmc: string,
  jiraId: string,
  role: string,
  erpUsername: string,
  erpPassword: string,
): Promise<UploadScriptResponse> {
  // Create a ZIP file containing the .bc file
  const zip = new AdmZip();
  zip.addFile(`${scriptName}.bc`, Buffer.from(bcFileContent, "utf-8"));
  
  // Convert ZIP to base64
  const zipBuffer = zip.toBuffer();
  const base64ZipData = zipBuffer.toString("base64");

  const response = await apiClient.post<UploadScriptResponse>(`${serverUrl}/component/script/upload`, {
      script: scriptName,
      data: base64ZipData,
      vrc,
      username: os.userInfo().username,
      projectName,
      pmc,
      jiraID: jiraId,
      role: role.toLowerCase(),
    }, { auth: { username: erpUsername, password: erpPassword } });

  return {
    script: response.script,
    vrc: response.vrc,
    path: response.path,
    success: response.success,
    errorMessage: response.errorMessage,
  };
}

/**
 * Compile script on ERP (receives base64 of ZIP of output files)
 */
export async function compileScript(
  serverUrl: string,
  script: string,
  vrc: string,
  projectName: string,
  pmc: string,
  jiraId: string,
  role: string,
  erpUsername: string,
  erpPassword: string,
): Promise<CompileScriptResponse> {
  const response = await apiClient.post<CompileScriptResponse>(`${serverUrl}/component/script/compile`, {
      script,
      vrc,
      username: os.userInfo().username,
      projectName,
      pmc,
      jiraID: jiraId,
      role: role.toLowerCase(),
    }, { auth: { username: erpUsername, password: erpPassword } });

  // Extract ZIP and get output file content
  let compilationOutput = "";
  
  if (response.compilationOutput) {
    try {
      // Decode base64 ZIP
      const zipBuffer = Buffer.from(response.compilationOutput, "base64");
      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();
      
      // Extract all file contents and concatenate them
      const outputParts: string[] = [];
      for (const entry of zipEntries) {
        if (!entry.isDirectory) {
          const content = entry.getData().toString("utf-8");
          outputParts.push(`=== ${entry.entryName} ===\n${content}\n`);
        }
      }
      compilationOutput = outputParts.join("\n");
    } catch (error) {
      console.error("Failed to extract compilation output ZIP:", error);
      // Fall back to treating it as plain text
      compilationOutput = Buffer.from(response.compilationOutput, "base64").toString("utf-8");
    }
  }

  return {
    script: response.script,
    vrc: response.vrc,
    compileSuccess: response.compileSuccess,
    compilationOutput,
  };
}
