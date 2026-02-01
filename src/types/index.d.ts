/**
 * Core type definitions
 */

export type UPDATE_MODE = "CREATE" | "UPDATE" | "DELETE" | "IMPORT";

export interface Project {
  name: string;
  pmc: string;
  jiraId: string;
  vrc: string;
  role: "Developer" | "Reviewer" | "";
  environment: string;
  createdAt: number;
}
