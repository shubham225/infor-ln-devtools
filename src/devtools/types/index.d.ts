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
