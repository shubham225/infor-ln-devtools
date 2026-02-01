/**
 * API request/response type definitions
 */

export interface Component {
  type: string;
  package: string;
  module: string;
  code: string;
}

export interface FetchModulesResponse {
  [type: string]: Array<{ package: string; module: string[] }>;
}

export interface FetchComponentsResponse {
  type: string;
  package: string;
  module: string;
  components: Array<{ code: string; desc: string }>;
}

export interface ValidateProjectResponse {
  valid: boolean;
  errorMessage?: string;
  warningMessage?: string;
}

export interface DownloadComponentsResponse {
  data: string;
}

export interface DownloadComponentsByPMCResponse {
  data: string;
}

export interface CloseProjectResponse {
  success: boolean;
  errorMessage?: string;
}

export interface FetchVRCsResponse {
  vrcs: string[];
}

export interface EnvironmentMapping {
  environment: string;
  backendUrl: string;
}

export interface ConfigSettings {
  environments: EnvironmentMapping[];
  defaultEnvironment: string;
}

export interface ImportFormSettings {
  projectName: string;
  vrc: string;
  role: "Developer" | "Reviewer";
  jiraId: string;
}

export interface ImportByPMCFormSettings {
  pmc: string;
  vrc: string;
  role: "Developer" | "Reviewer";
  jiraId: string;
}

export interface CompileScriptResponse {
  script: string;
  vrc: string;
  compileSuccess: boolean;
  compilationOutput: string;
}

export interface UploadScriptResponse {
  script: string;
  vrc: string;
  path: string;
  success: boolean;
  errorMessage?: string;
}

export interface HealthCheckResponse {
  status: string;
  username: string;
}
