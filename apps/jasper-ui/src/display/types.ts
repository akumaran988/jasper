import React from 'react';

export interface ToolResult {
  success: boolean;
  result?: any;
  stdout?: string;
  stderr?: string;
  error?: string;
  [key: string]: any;
}

export interface DisplayContext {
  toolName: string;
  operation?: string;
  parameters: Record<string, any>;
  result: ToolResult;
  isExpanded: boolean;
  isFocused: boolean;
  displayNumber?: number;
}

export interface DisplayResult {
  content: string;
  isFileContent?: boolean;
  hasExistingLineNumbers?: boolean;
  shouldCollapse?: boolean;
  customComponent?: React.ReactElement;
}

export interface ToolDisplayHandler {
  /**
   * The name of the tool this handler manages
   */
  toolName: string;
  
  /**
   * Check if this handler can process the given result
   */
  canHandle(context: DisplayContext): boolean;
  
  /**
   * Process the tool result and return formatted content
   */
  formatResult(context: DisplayContext): DisplayResult;
  
  /**
   * Get a brief summary for collapsed view
   */
  getSummary(context: DisplayContext): string;
  
  /**
   * Check if content should be collapsed by default
   */
  shouldCollapse(context: DisplayContext): boolean;
}