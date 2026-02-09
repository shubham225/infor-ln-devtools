import * as vscode from "vscode";

export interface ParsedFunction {
  name: string;
  range: vscode.Range;
  parameters: string[];
  returnType: string;
}

export interface ParsedVariable {
  name: string;
  type: string;
  range: vscode.Range;
}

export interface FunctionDoc {
  name: string;
  syntax: string;
  description: string;
  arguments: Array<{ type: string; name: string; description: string }>;
  returnValue: string;
  category: string;
}

export interface FunctionDocDB {
  name: string;
  type: 'function' | 'keyword' | 'variable' | 'concept';
  syntax?: string;
  description: string;
  arguments?: Array<{ type: string; name: string; description: string }>;
  returnValue?: string;
  category: string;
  dataType?: string; 
  attributes?: string; 
  context?: string;  
}