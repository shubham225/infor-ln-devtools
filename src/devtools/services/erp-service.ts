import { apiClient } from "../utils/api-client";
import * as os from "os";
import AdmZip from "adm-zip";
import FormData from "form-data";
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
import type { Project, Credentials } from "../types";

/**
 * Health check to verify ERP connection and credentials
 */
export async function healthCheck(
  serverUrl: string,
  creds: Credentials,
): Promise<HealthCheckResponse> {
  const data = await apiClient.get<HealthCheckResponse>(`${serverUrl}/health`, {
    auth: creds,
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
  creds: Credentials,
  pmc?: string,
): Promise<string[]> {
  const url = pmc
    ? `${serverUrl}/pmc/${encodeURIComponent(pmc)}/vrc`
    : `${serverUrl}/vrcs`;
  const data = await apiClient.get<string[] | { vrcs: string[] }>(url, {
    auth: creds,
  });

  if (Array.isArray(data)) {
    return data as string[];
  }
  if (data && Array.isArray((data as any).vrcs)) {
    return (data as any).vrcs;
  }
  return [];
}

/**
 * Fetch modules from ERP — follows spec: GET /vrcs/{vrc}/packages
 */
export async function fetchModules(
  serverUrl: string,
  vrc: string,
  creds: Credentials,
): Promise<FetchModulesResponse> {
  const data = await apiClient.get<FetchModulesResponse>(
    `${serverUrl}/vrcs/${encodeURIComponent(vrc)}/packages`,
    { auth: creds },
  );
  return data as FetchModulesResponse;
}

/**
 * Fetch components for a specific module — GET /vrcs/{vrc}/components?package=..&module=..&type=..
 */
export async function fetchComponents(
  serverUrl: string,
  vrc: string,
  params: { type: string; package: string; module: string },
  creds: Credentials,
  signal?: AbortSignal,
): Promise<FetchComponentsResponse> {
  const q = new URLSearchParams({
    package: params.package,
    module: params.module,
    type: params.type,
  });
  const data = await apiClient.get<FetchComponentsResponse>(
    `${serverUrl}/vrcs/${encodeURIComponent(vrc)}/components?${q.toString()}`,
    { auth: creds, signal },
  );
  return data as FetchComponentsResponse;
}

/**
 * Validate project with ERP — POST /vrcs/{vrc}/projects/validate
 */
export async function validateProject(
  serverUrl: string,
  project: Project,
  creds: Credentials,
): Promise<ValidateProjectResponse> {
  const data = await apiClient.post<ValidateProjectResponse>(
    `${serverUrl}/vrcs/${encodeURIComponent(project.vrc)}/projects/validate`,
    {
      projectName: project.name,
      pmc: project.pmc,
      ticketId: project.ticketId,
      role: project.role?.toLowerCase?.(),
    },
    { auth: creds },
  );

  return {
    valid: data.valid,
    errorMessage: data.errorMessage,
    warningMessage: data.warningMessage,
  };
}

/**
 * Download (import) components (multipart upload) — POST /vrcs/{vrc}/components/import
 */
export async function downloadComponents(
  serverUrl: string,
  project: Project,
  components: Component[],
  creds: Credentials,
  signal?: AbortSignal,
): Promise<DownloadComponentsResponse> {
  const url = `${serverUrl}/vrcs/${encodeURIComponent(project.vrc)}/components/import`;

  const payload = {
    importFolder: project.name,
    projectName: project.name,
    pmc: project.pmc || "",
    role: (project.role || "").toLowerCase(),
    ticketId: project.ticketId || "",
    username: os.userInfo().username,
    components: components, // keep it as an array
  };

  const buf = await apiClient.download(url, payload, { auth: creds, signal });
  return { data: buf } as DownloadComponentsResponse;
}

/**
 * Download components by PMC — POST /pmc/{pmc}/download
 */
export async function downloadComponentsByPMC(
  serverUrl: string,
  pmc: string,
  vrc: string,
  projectName: string,
  role: string,
  ticketId: string,
  creds: Credentials,
  signal?: AbortSignal,
): Promise<DownloadComponentsByPMCResponse> {
  const url = `${serverUrl}/pmc/${encodeURIComponent(pmc)}/download`;
  const form = new FormData();
  form.append("vrc", vrc);
  form.append("projectName", projectName);
  form.append("username", os.userInfo().username);
  form.append("role", (role || "").toLowerCase());
  form.append("ticketId", ticketId || "");

  const buf = await apiClient.download(url, form, { auth: creds, signal });
  return { data: buf } as DownloadComponentsByPMCResponse;
}

/**
 * Close project on ERP — POST /vrcs/{vrc}/projects/close
 */
export async function closeProject(
  serverUrl: string,
  project: Project,
  creds: Credentials,
): Promise<CloseProjectResponse> {
  const data = await apiClient.post<CloseProjectResponse>(
    `${serverUrl}/vrcs/${encodeURIComponent(project.vrc)}/projects/close`,
    {
      pmc: project.pmc,
      vrc: project.vrc,
      projectName: project.name,
      role: (project.role || "").toLowerCase(),
      ticketId: project.ticketId,
      username: os.userInfo().username,
    },
    { auth: creds },
  );

  return {
    success: data.success,
    errorMessage: data.errorMessage,
  };
}

/**
 * Upload script to ERP (multipart file upload)
 * POST /vrcs/{vrc}/components/Script/{scriptName}/source
 */
export async function uploadScript(
  serverUrl: string,
  project: Project,
  scriptName: string,
  bcFileContent: string,
  creds: Credentials,
): Promise<UploadScriptResponse> {
  const url = `${serverUrl}/vrcs/${encodeURIComponent(project.vrc)}/components/Script/${encodeURIComponent(scriptName)}/source`;
  const zip = new AdmZip();
  zip.addFile(`${scriptName}.bc`, Buffer.from(bcFileContent, "utf-8"));
  const buf = zip.toBuffer();
  const form = new FormData();
  form.append("file", buf, {
    filename: `${scriptName}.zip`,
    contentType: "application/zip",
  });
  form.append("projectName", project.name);
  form.append("pmc", project.pmc || "");
  form.append("ticketId", project.ticketId || "");
  form.append("username", os.userInfo().username);

  const response = await apiClient.post<UploadScriptResponse>(url, form, {
    auth: creds,
  });
  return {
    script: response.script,
    vrc: response.vrc,
    path: response.path,
    success: response.success,
    errorMessage: response.errorMessage,
  };
}

/**
 * Compile script on ERP — POST /vrcs/{vrc}/components/Script/{scriptName}/compile
 * Returns binary ZIP with compilation output
 */
export async function compileScript(
  serverUrl: string,
  project: Project,
  scriptName: string,
  creds: Credentials,
): Promise<CompileScriptResponse> {
  const url = `${serverUrl}/vrcs/${encodeURIComponent(project.vrc)}/components/Script/${encodeURIComponent(scriptName)}/compile`;
  const form = new FormData();
  form.append("projectName", project.name);
  form.append("pmc", project.pmc || "");
  form.append("ticketId", project.ticketId || "");
  form.append("username", os.userInfo().username);

  const buf = await apiClient.download(url, form, { auth: creds });

  // Extract ZIP and get output file content
  let compilationOutput = "";
  try {
    const zip = new AdmZip(buf);
    const zipEntries = zip.getEntries();
    const outputParts: string[] = [];
    for (const entry of zipEntries) {
      if (!entry.isDirectory) {
        const content = entry.getData().toString("utf-8");
        outputParts.push(`=== ${entry.entryName} ===\n${content}\n`);
      }
    }
    compilationOutput = outputParts.join("\n");
  } catch (err) {
    // fallback to treating buffer as utf-8 text
    compilationOutput = buf.toString("utf-8");
  }

  return {
    script: scriptName,
    vrc: project.vrc,
    compileSuccess: true,
    compilationOutput,
  };
}
