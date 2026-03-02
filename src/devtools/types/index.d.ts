/**
 * Core type definitions
 */

export type UPDATE_MODE = "CREATE" | "UPDATE" | "DELETE" | "IMPORT";

export interface Project {
  name: string;
  pmc: string;
  ticketId: string;
  vrc: string;
  role: "Developer" | "Reviewer" | "";
  environment: string;
  createdAt: number;
}

export interface Credentials {
  username: string;
  password: string;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

interface CompilationResult {
  script: string;
  success: boolean;
  output: string;
}

export interface LoginFormData {
  username: string;
  password: string;
}

interface TableData {
  table: string;
  description: string;
  tableIndices: Array<{
    name: string;
    indexFields: string[];
  }>;
  tableFields: Array<{
    name: string;
    description?: string;
    domain?: string;
    datatype?: string;
    enumDescr?: string;
    enumDomainData?: Array<{
      constant: string;
      description: string;
    }>;
    mandatory?: string;
    initialValue?: string;
    referenceTable?: string;
    referenceMode?: string;
    checkByDBMS?: string;
    deleteMode?: string;
  }>;
}

interface SessionData {
  session: string;
  sessionDescription: string;
  programScript: string;
  mainTable: string;
  sessionType: string;
  startCommand: number;
  windowType: string;
  sessionForm: {
    enabledStandardCommands: string[];
    sessionForm: string;
    formFields: Array<{
      sequence: number;
      fieldName: string;
      fieldLabel?: string;
      fieldType: string;
      zoomType?: string;
      zoomToProgram?: string;
      zoomReturnField?: string;
      domain?: string;
      datatype?: string;
      enumDescr?: string;
      enumDomainData?: Array<{
        constant: string;
        description: string;
      }>;
    }>;
    formCommands: Array<{
      serialNumber: number;
      commandType: string;
      activateA: string;
      "Name of Session/Function/Method": string;
      description: string;
      button: string;
      sortSequence: number;
      commandAvailability: string;
      detail: string;
      parentMenu: number;
      sessionStartMode: string;
      kindOfSession: string;
    }>;
  };
}
