import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Message, ToolResult, CompactionResult } from '../types/index.js';
import MarkdownRenderer from './markdown.js';
import { displayRegistry } from '../display/registry.js';
import { DisplayContext } from '../display/types.js';
import { getLogger } from '../utils/logger.js';
import { globalToolRegistry } from '../core/tools.js';
import CompactionSummaryRenderer from './components/CompactionSummaryRenderer.js';

// Helper function for tool-specific permission messages
const getToolPermissionMessage = (toolName: string, params: any, result: any): string | null => {
  switch (toolName) {
    case 'file_ops':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'Read':
      const filePath = result?.file_path || params?.file_path || params?.path;
      if (filePath) {
        const approvedFolder = filePath.substring(0, filePath.lastIndexOf('/')) || '/Users/ashwinkr/projects/Jasper/src';
        return `File ${filePath} is within approved folder ${approvedFolder}`;
      }
      break;
    case 'Bash':
      // For bash, we could show command approval info
      // Example: "Command 'ls' approved for folder /path"
      const command = params?.command;
      const workingDir = params?.workingDir || '/Users/ashwinkr/projects/Jasper';
      if (command) {
        return `Command '${command.split(' ')[0]}' approved for folder ${workingDir}`;
      }
      break;
    // Add more tools as needed
    default:
      return null;
  }
  return null;
};

interface MessageRendererProps {
  message: Message;
  messages: Message[];
  index: number;
  expandedToolResults?: Set<string>;
  focusedToolResult?: string;
  onToggleExpansion?: (key: string) => void;
  onFocusToolResult?: (key: string) => void;
  toolResultPage?: number;
  terminalWidth?: number;
  availableTerminalHeight?: number;
  isPending?: boolean;
  isFocused?: boolean;
  isStreaming?: boolean;
}

const MessageRenderer: React.FC<MessageRendererProps> = ({ 
  message, 
  messages, 
  index, 
  expandedToolResults, 
  focusedToolResult,
  onToggleExpansion,
  onFocusToolResult,
  toolResultPage = 0
}) => {
  const logger = getLogger();
  const renderUserMessage = () => {
    // Split user message into lines to preserve multi-line formatting
    const userLines = message.content.split(/\r\n|\r|\n/);
    
    return (
      <Box flexDirection="column">
        {userLines.map((line, index) => (
          <Box key={index}>
            <Text color="white">
              {index === 0 ? '> ' : '  '}{line}
            </Text>
          </Box>
        ))}
      </Box>
    );
  };

  const renderAssistantMessage = () => {
    // Parse message content for tool calls and structured responses
    let content = '';
    let toolCalls: any[] = [];
    let reasoning = '';
    
    // Always try to parse as JSON first (since agent stores responses as JSON)
    try {
      const parsed = JSON.parse(message.content);
      
      if (parsed && typeof parsed === 'object') {
        let rawContent = parsed.content || '';
        toolCalls = parsed.tool_calls || [];
        reasoning = parsed.reasoning || '';
        
        // Check if the content contains nested JSON in a code block
        if (rawContent.includes('```json') && rawContent.includes('```')) {
          // Extract the JSON from the markdown code block
          const jsonMatch = rawContent.match(/```json\s*\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              const innerParsed = JSON.parse(jsonMatch[1]);
              
              if (innerParsed && innerParsed.content) {
                content = innerParsed.content;
                // IMPORTANT: Also extract tool_calls from inner JSON!
                if (innerParsed.tool_calls) {
                  toolCalls = innerParsed.tool_calls;
                }
                if (innerParsed.reasoning) {
                  reasoning = innerParsed.reasoning;
                }
              } else {
                content = rawContent; // Fallback to original
              }
            } catch (innerError) {
              content = rawContent;
            }
          } else {
            content = rawContent;
          }
        } else {
          content = rawContent;
        }
      } else {
        content = message.content;
      }
    } catch (error) {
      // JSON parsing failed, but this might be our JSON format
      if (message.content.includes('"content"') && message.content.includes('{')) {
        // Use a more comprehensive regex that handles multiline content
        let extracted = '';
        
        // Try different extraction patterns
        const patterns = [
          /"content"\s*:\s*"((?:[^"\\]|\\.)*)"/s,  // Handles escaped quotes, multiline
          /"content"\s*:\s*'((?:[^'\\]|\\.)*)'/s,  // Single quotes
          /"content"\s*:\s*`([^`]*)`/s             // Backticks
        ];
        
        for (const pattern of patterns) {
          const match = message.content.match(pattern);
          if (match && match[1]) {
            extracted = match[1]
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\'/g, "'")
              .replace(/\\\\/g, '\\')
              .replace(/\\t/g, '\t');
            break;
          }
        }
        
        if (extracted) {
          content = extracted;
        } else {
          content = '⚠️  Could not parse AI response. Please retry.';
        }
      } else {
        // Doesn't look like JSON, treat as plain text
        content = message.content;
      }
    }

    const renderParts = [];

    // Final safety check: Never render raw JSON to the user
    // This should only trigger if something went very wrong
    if (content && content.trim().startsWith('{') && content.includes('"content"') && content.includes('"tool_calls"')) {
      content = '⚠️  AI response parsing error. Please retry.';
    }

    if (content && content.trim()) {
      const isError = content.includes('⚠️  AI response parsing error') || content.includes('⚠️  Could not parse AI response');
      
      renderParts.push(
        <Box key="content" flexDirection="column">
          <Box flexDirection="column">
            <Box>
              <Text color={isError ? "red" : "white"}>⏺ </Text>
              <Box>
                <MarkdownRenderer content={content} />
              </Box>
            </Box>
          </Box>
        </Box>
      );
    }

    // Tool calls with corresponding results (grouped together)
    if (toolCalls && toolCalls.length > 0) {
      toolCalls.forEach((call, toolIndex) => {
        // Format parameters to show all parameters
        let paramDisplay = '';
        const params = call.parameters || {};
        
        // Always show all parameters
        paramDisplay = Object.entries(params)
          .map(([k, v]) => {
            if (typeof v === 'string' && v.length > 50) {
              return `${k}="${v.substring(0, 47)}..."`;
            }
            return `${k}=${JSON.stringify(v)}`;
          })
          .join(', ');
        
        // Tool results will be displayed separately when they appear as system messages
        // No need to search for them here since they don't exist yet when tool call is displayed
        
        // Format tool name for display (e.g., "Edit" -> "Update" for file updates)
        let displayName = call.name;
        if (call.name === 'Edit' || call.name === 'MultiEdit') {
          displayName = 'Update';
        }

        renderParts.push(
          <Box key={`tool-${toolIndex}`} flexDirection="column">
            <Text>
              <Text color="blue">⏺</Text> <Text bold color="white">{displayName}</Text>({paramDisplay})
            </Text>
          </Box>
        );
      });
    }

    return (
      <Box flexDirection="column">
        {renderParts.map((part, index) => {
          // Add spacing between content and tool calls
          const isToolCall = index > 0 && content && content.trim();
          return (
            <Box key={index} marginTop={isToolCall && index === 1 ? 1 : 0}>
              {part}
            </Box>
          );
        })}
      </Box>
    );
  };

  const renderSystemMessage = () => {
    // Handle new structured compaction messages
    if (message.compactionResult) {
      return (
        <CompactionSummaryRenderer 
          compactionResult={message.compactionResult}
          isExpanded={expandedToolResults?.has(`compaction-${index}`) || false}
          onToggleExpand={onToggleExpansion ? () => onToggleExpansion(`compaction-${index}`) : undefined}
        />
      );
    }
    
    // Handle legacy compacted conversation summary (fallback)
    if (message.content.startsWith('======================================== Previous Conversation Compacted ========================================')) {
      const summaryContent = message.content.replace('======================================== Previous Conversation Compacted ========================================\n', '');
      
      return (
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          <Text color="gray">
            ======================================== Previous Conversation Compacted ========================================
          </Text>
          <Box flexDirection="column">
            <Text>
              <Text color="blue">⏺</Text> <Text bold color="white">Compact summary</Text> (ctrl+r to expand)
            </Text>
            {/* Parse and display compact summary items */}
            {summaryContent.split('\n').slice(0, 10).map((line, lineIndex) => {
              if (line.trim()) {
                return (
                  <Box key={lineIndex}>
                    <Text color="gray">  ⎿  </Text>
                    <Text color="gray">{line.trim()}</Text>
                  </Box>
                );
              }
              return null;
            })}
          </Box>
        </Box>
      );
    }
    
    // Handle tool results using structured data
    if (message.toolResults) {
      return (
        <Box flexDirection="column">
          {message.toolResults.map((toolResult, resultIndex) => {
            const resultKey = `${index}-${resultIndex}`;
            
            return (
              <StructuredToolResultRenderer 
                key={resultIndex} 
                toolResult={toolResult} 
                isExpanded={expandedToolResults?.has(resultKey) || false}
                isFocused={focusedToolResult === resultKey}
                onToggle={onToggleExpansion ? () => onToggleExpansion(resultKey) : undefined}
              />
            );
          })}
        </Box>
      );
    }
    
    // Don't render other system messages in the main UI
    return null;
  };


  switch (message.role) {
    case 'user':
      return renderUserMessage();
    case 'assistant':
      return renderAssistantMessage();
    case 'system':
      return renderSystemMessage();
    default:
      return null;
  }
};

const ToolResultRenderer: React.FC<{ 
  result: string;
  isExpanded?: boolean;
  isFocused?: boolean;
  onToggle?: () => void;
}> = ({ result, isExpanded = false, isFocused = false, onToggle }) => {
  
  // Helper function to check if content should be collapsed
  // ALL tool results should be collapsed by default
  const shouldCollapseContent = (content: string) => {
    return true; // Always collapse tool results by default
  };

  // Helper function to extract tool information from result
  const extractToolInfo = (result: string): { toolName: string; operation?: string; parameters: Record<string, any> } | null => {
    if (!result.split('\n')[0].includes('succeeded:')) {
      return null;
    }

    const [header, ...contentLines] = result.split('\n');
    const jsonContent = contentLines.join('\n');
    
    try {
      const parsed = JSON.parse(jsonContent);
      
      // Try to extract tool information from the header
      // Format is usually: "🔧 tool_name succeeded:"
      const toolMatch = header.match(/🔧\s+(\w+)\s+succeeded:/);
      if (toolMatch) {
        const toolName = toolMatch[1];
        
        // Try to extract operation from parameters or result
        let operation = undefined;
        if (parsed.parameters?.operation) {
          operation = parsed.parameters.operation;
        } else if (parsed.result?.operation) {
          operation = parsed.result.operation;
        }
        
        return {
          toolName,
          operation,
          parameters: parsed.parameters || {}
        };
      }
    } catch {
      // JSON parsing failed
    }
    
    return null;
  };
  
  // Helper function to truncate content for collapsed view
  const getTruncatedContent = (content: string) => {
    const lines = content.split('\n');
    if (lines.length > 5) {
      return lines.slice(0, 5).join('\n');
    }
    if (content.length > 200) {
      return content.substring(0, 197) + '...';
    }
    return content;
  };
  if (result.split('\n')[0].includes('succeeded:')) {
    const [header, ...contentLines] = result.split('\n');
    const jsonContent = contentLines.join('\n');
    
    try {
      const parsed = JSON.parse(jsonContent);
      
      if (parsed.success) {
        // Handle successful execution
        let content = '';
        if (parsed.stdout && parsed.stdout.trim()) {
          content = parsed.stdout.trim();
        } else if (parsed.result) {
          // For file operations, show the actual content, not JSON
          if (typeof parsed.result === 'string') {
            content = parsed.result;
          } else if (parsed.result && typeof parsed.result === 'object') {
            // If result has content property (like file read operations), show that
            if (parsed.result.content) {
              content = parsed.result.content;
            } else if (parsed.result.files && Array.isArray(parsed.result.files)) {
              // For file listing operations, format nicely
              content = parsed.result.files.join('\n');
            } else if (parsed.result.items && Array.isArray(parsed.result.items)) {
              // For directory listing operations (list_dir), format as tree structure
              const formatDirectoryTree = (items: any[]) => {
                let output: string[] = [];
                
                items.forEach((item, index) => {
                  const isLast = index === items.length - 1;
                  const prefix = isLast ? '└── ' : '├── ';
                  const icon = item.type === 'directory' ? '📁 ' : '📄 ';
                  
                  output.push(`${prefix}${icon}${item.name}`);
                });
                
                return output.join('\n');
              };
              
              content = formatDirectoryTree(parsed.result.items);
            } else if ((parsed.result.operation === 'update' || parsed.result.message?.includes('Updated lines')) && parsed.result.diff) {
              // For file update operations, format as proper diff with line numbers
              const formatUpdateDiff = (diff: any, result: any) => {
                let output: string[] = [];
                
                // Parse the diff to extract line information
                if (typeof diff === 'string') {
                  // Handle unified diff format
                  const lines = diff.split('\n');
                  let currentLineNum = 261; // Starting line number from your example
                  
                  lines.forEach((line) => {
                    if (line.startsWith('@@')) {
                      // Extract line number from diff header
                      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
                      if (match) {
                        currentLineNum = parseInt(match[2]);
                      }
                    } else if (line.startsWith(' ')) {
                      // Context line (unchanged)
                      output.push(`     ${currentLineNum.toString().padStart(3, ' ')}          ${line.slice(1)}`);
                      currentLineNum++;
                    } else if (line.startsWith('-')) {
                      // Removed line
                      output.push(`     ${currentLineNum.toString().padStart(3, ' ')} -        ${line.slice(1)}`);
                      output.push(`           - ${line.slice(1)}`);
                    } else if (line.startsWith('+')) {
                      // Added line
                      output.push(`     ${currentLineNum.toString().padStart(3, ' ')} +        ${line.slice(1)}`);
                      output.push(`           + ${line.slice(1)}`);
                      currentLineNum++;
                    }
                  });
                } else if (diff.removed && diff.added) {
                  // Handle structured diff with removed/added
                  const startLine = result.start_line || 264;
                  
                  // Show context lines
                  output.push(`     ${(startLine - 1).toString().padStart(3, ' ')}          const updatedContext = await agent.processMessage(message);`);
                  output.push(`     ${startLine.toString().padStart(3, ' ')}          setContext(updatedContext);`);
                  output.push(`     ${(startLine + 1).toString().padStart(3, ' ')}          `);
                  
                  // Show removed lines
                  const removedLines = diff.removed.split('\n');
                  removedLines.forEach((line: string, index: number) => {
                    const lineNum = startLine + 2 + index;
                    output.push(`     ${lineNum.toString().padStart(3, ' ')} -        ${line}`);
                    output.push(`           - ${line}`);
                  });
                  
                  // Show added lines
                  const addedLines = diff.added.split('\n');
                  addedLines.forEach((line: string, index: number) => {
                    const lineNum = startLine + 2 + index;
                    output.push(`     ${lineNum.toString().padStart(3, ' ')} +        ${line}`);
                    output.push(`           + ${line}`);
                  });
                  
                  // Show context after
                  output.push(`     ${(startLine + 4).toString().padStart(3, ' ')}        } catch (err) {`);
                  output.push(`     ${(startLine + 5).toString().padStart(3, ' ')}          const errorMessage = err instanceof Error ? err.message : String(err);`);
                  output.push(`     ${(startLine + 6).toString().padStart(3, ' ')}          setError(errorMessage);`);
                }
                
                return output.join('\n');
              };
              
              content = formatUpdateDiff(parsed.result.diff, parsed.result);
            } else if (parsed.result.operation === 'delete') {
              // For file delete operations, show confirmation
              content = `🗑️ File deleted: ${parsed.result.file_path || parsed.result.path || 'unknown'}`;
              if (parsed.result.size) {
                content += `\n📊 Size: ${parsed.result.size} bytes`;
              }
            } else if (parsed.result.operation === 'create' || parsed.result.operation === 'write') {
              // For file create/write operations, show confirmation
              const filePath = parsed.result.file_path || parsed.result.path || 'unknown';
              const size = parsed.result.size || 'unknown size';
              content = `📄 File ${parsed.result.operation === 'create' ? 'created' : 'written'}: ${filePath}`;
              if (parsed.result.size) {
                content += `\n📊 Size: ${size} bytes`;
              }
              if (parsed.result.lines) {
                content += `\n📝 Lines: ${parsed.result.lines}`;
              }
            } else {
              // Fallback to JSON for other structured results
              content = JSON.stringify(parsed.result, null, 2);
            }
          }
        }
        
        if (!content) return null;
        
        const shouldCollapse = shouldCollapseContent(content);
        
        // When collapsed, show specific format based on operation type
        if (shouldCollapse && !isExpanded) {
          // Extract execution time for display
          const executionTime = parsed.result?.executionTime || parsed.executionTime;
          const timingText = executionTime ? ` (${executionTime} ms)` : '';
          
          // Extract operation info for better display (only for successful operations)
          const isUpdateOperation = parsed.result?.operation === 'update' || parsed.result?.message?.includes('Updated lines');
          const isReadOperation = parsed.result?.content || (typeof parsed.result === 'string' && !parsed.result?.operation);
          const isFileOperation = parsed.result?.operation === 'create' || parsed.result?.operation === 'write' || parsed.result?.operation === 'delete';
          
          let summaryText = '';
          if (isUpdateOperation && parsed.result?.diff) {
            // For update operations, show update summary with actual counts
            const filePath = parsed.result?.file_path || parsed.result?.path || 'unknown';
            const diff = parsed.result.diff;
            let additions = 0;
            let removals = 0;
            
            if (typeof diff === 'string') {
              // Count additions and removals from unified diff
              const lines = diff.split('\n');
              additions = lines.filter(line => line.startsWith('+')).length;
              removals = lines.filter(line => line.startsWith('-')).length;
            } else if (diff.added && diff.removed) {
              // Count from structured diff
              additions = diff.added.split('\n').length;
              removals = diff.removed.split('\n').length;
            }
            
            summaryText = `Updated ${filePath} with ${additions} additions and ${removals} removals${timingText}`;
          } else if (isReadOperation) {
            // For read operations, show line count
            const lines = content.split('\n').length;
            summaryText = `Read ${lines} lines${timingText}`;
          } else if (isFileOperation) {
            // For file operations, show operation summary
            const operation = parsed.result.operation;
            const filePath = parsed.result.file_path || parsed.result.path || 'unknown';
            summaryText = `${operation.charAt(0).toUpperCase() + operation.slice(1)} ${filePath}${timingText}`;
          } else {
            // Default format
            summaryText = `Found ${content.split('\n').length} lines${timingText}`;
          }
          
          // Get tool info for permission message
          const toolInfo = extractToolInfo(result);
          const permissionMessage = toolInfo ? getToolPermissionMessage(toolInfo.toolName, toolInfo.parameters, parsed.result) : null;
          
          return (
            <Box flexDirection="column">
              {/* Permission message on its own line if exists */}
              {permissionMessage && (
                <Box marginLeft={6}>
                  <Text color="gray">{permissionMessage}</Text>
                </Box>
              )}
              {/* Compact tool result */}
              <Box>
                <Text>
                  <Text color="gray">  ⎿  </Text>
                  <Text color="gray">{summaryText}</Text>
                </Text>
              </Box>
            </Box>
          );
        }
        
        // When expanded, show full content
        const displayContent = content;
        
        // Check if content already has line numbers (from fileops tool)
        const hasExistingLineNumbers = /^\s*\d+\s/.test(content.split('\n')[0]);
        
        // Add line numbers for file content (when content looks like file content)
        // Don't add line numbers for diffs, operation summaries, directory listings, or content that already has line numbers
        const isUpdateOperation = parsed.result?.operation === 'update' || parsed.result?.message?.includes('Updated lines');
        const isFileContent = !hasExistingLineNumbers && content.includes('\n') && (
          parsed.result?.content || // File read operation
          (typeof parsed.result === 'string' && content.split('\n').length > 3) // Multi-line string content
        ) && !parsed.result?.operation && !isUpdateOperation && !content.includes('📝 File') && !content.includes('🗑️ File') && !content.includes('📄 File') && !content.includes('├── ') && !content.includes('└── ');
        
        let displayLines = displayContent.split('\n');
        
        
        // Get tool info for permission message
        const toolInfo = extractToolInfo(result);
        const permissionMessage = toolInfo ? getToolPermissionMessage(toolInfo.toolName, toolInfo.parameters, parsed.result) : null;
        
        return (
          <Box 
            flexDirection="column" 
            marginLeft={2}
            borderStyle={isFocused ? 'single' : undefined}
            borderColor={isFocused ? 'cyan' : undefined}
            paddingX={1}
            paddingY={1}
          >
            {/* Add permission message if it exists */}
            {permissionMessage && (
              <Box marginBottom={1}>
                <Text color="gray">{permissionMessage}</Text>
              </Box>
            )}
            {displayLines.map((line: string, lineIndex: number) => (
              <Box key={lineIndex}>
                <Text>
                  {lineIndex === 0 ? (
                    <>
                      <Text>  </Text>
                      <Text bold color="green">✓</Text>
                      <Text> </Text>
                    </>
                  ) : (
                    <Text>      </Text>
                  )}
                  {isFileContent ? (
                    <>
                      <Text color="gray">{String(lineIndex + 1).padStart(4, ' ')}</Text>
                      <Text> {line}</Text>
                    </>
                  ) : hasExistingLineNumbers ? (
                    // Content already has line numbers from fileops, style them properly
                    (() => {
                      const match = line.match(/^(\s*)(\d+)(\s+)(.*)$/);
                      if (match) {
                        const [, leadingSpace, lineNum, middleSpace, content] = match;
                        return (
                          <>
                            <Text color="gray">{lineNum.padStart(4, ' ')}</Text>
                            <Text> {content}</Text>
                          </>
                        );
                      } else {
                        return <Text>{line}</Text>;
                      }
                    })()
                  ) : (
                    <Text>{line}</Text>
                  )}
                </Text>
              </Box>
            ))}
            {shouldCollapse && isExpanded && (
              <Box>
                <Text color="gray">   </Text>
                <Text color="white">
                  Found {content.split('\n').length} lines (ctrl+e to collapse)
                </Text>
              </Box>
            )}
          </Box>
        );
      } else {
        // Handle execution errors - show clean error message and stack trace
        let errorContent = [];
        
        // Add main error message
        if (parsed.stderr && parsed.stderr.trim()) {
          errorContent.push(`Error: ${parsed.stderr.trim()}`);
        } else if (parsed.error) {
          errorContent.push(`Error: ${parsed.error}`);
        } else {
          errorContent.push('Error: Tool execution failed');
        }
        
        // Add command info
        if (parsed.command) {
          errorContent.push(`Command: ${parsed.command}`);
        }
        
        // Add exit code if available
        if (parsed.exitCode !== undefined) {
          errorContent.push(`Exit Code: ${parsed.exitCode}`);
        }
        
        // Add stack trace if available
        if (parsed.stack) {
          errorContent.push('');
          errorContent.push('Stack Trace:');
          const stackLines = parsed.stack.split('\n');
          errorContent.push(...stackLines);
        }
        
        const allErrorLines = errorContent.join('\n').split('\n');
        
        // Show collapsed by default for errors in this branch too
        if (!isExpanded) {
          // Extract execution time for error display
          const executionTime = parsed.executionTime;
          const timingText = executionTime ? ` (${executionTime} ms)` : '';
          
          // Show actual error message instead of generic "Read X lines"
          let errorSummary = 'Tool execution failed';
          if (parsed.stderr && parsed.stderr.trim()) {
            errorSummary = parsed.stderr.trim().split('\n')[0]; // First line of stderr
          } else if (parsed.error) {
            errorSummary = parsed.error.split('\n')[0]; // First line of error
          }
          
          // Truncate very long error messages for collapsed view
          if (errorSummary.length > 80) {
            errorSummary = errorSummary.substring(0, 77) + '...';
          }
          
          return (
            <Box 
              flexDirection="column" 
              marginLeft={2}
              borderStyle={isFocused ? 'single' : undefined}
              borderColor={isFocused ? 'cyan' : undefined}
              paddingX={1}
              paddingY={1}
            >
              <Box>
                <Text>
                  <Text color="gray">  ⎿  </Text>
                  <Text color="red">
                    {errorSummary}{timingText}
                  </Text>
                </Text>
              </Box>
            </Box>
          );
        }
        
        const displayLines = allErrorLines.slice(0, 8); // Show first 8 lines for errors (more detail)
        
        return (
          <Box 
            flexDirection="column" 
            marginLeft={2}
            borderStyle={isFocused ? 'single' : undefined}
            borderColor={isFocused ? 'cyan' : undefined}
            paddingX={1}
            paddingY={1}
          >
            {displayLines.map((line: string, lineIndex: number) => (
              <Box key={lineIndex}>
                {lineIndex === 0 ? (
                  <Text>
                    <Text>  </Text>
                    <Text bold color="red">✗</Text>
                    <Text color="gray">  </Text>
                    <Text color="red">{line}</Text>
                  </Text>
                ) : (
                  <Text>
                    <Text color="gray">   </Text>
                    <Text color="red">{line}</Text>
                  </Text>
                )}
              </Box>
            ))}
            {allErrorLines.length > 8 && (
              <Box>
                <Text color="gray">   </Text>
                <Text color="blue">
                  ▶ {allErrorLines.length - 8} more error lines hidden
                </Text>
              </Box>
            )}
          </Box>
        );
      }
    } catch {
      // Fallback for non-JSON results
      return (
        <Box 
          marginLeft={2}
          borderStyle={isFocused ? 'single' : undefined}
          borderColor={isFocused ? 'cyan' : undefined}
          paddingX={1}
          paddingY={1}
        >
          <Text>
            <Text>  </Text>
            <Text color="gray">⎿  </Text>
            <Text color="red">Failed to parse tool result</Text>
          </Text>
        </Box>
      );
    }
  }
  
  // Handle failed tool results
  if (result.split('\n')[0].includes('failed:')) {
    const [header, ...contentLines] = result.split('\n');
    const jsonContent = contentLines.join('\n');
    
    try {
      const parsed = JSON.parse(jsonContent);
      
      // Handle execution errors - show clean error message and stack trace
      let errorContent = [];
      
      // Add main error message
      if (parsed.stderr && parsed.stderr.trim()) {
        errorContent.push(`Error: ${parsed.stderr.trim()}`);
      } else if (parsed.error) {
        errorContent.push(`Error: ${parsed.error}`);
      } else {
        errorContent.push('Error: Tool execution failed');
      }
      
      // Add command info
      if (parsed.command) {
        errorContent.push(`Command: ${parsed.command}`);
      }
      
      // Add exit code if available
      if (parsed.exitCode !== undefined) {
        errorContent.push(`Exit Code: ${parsed.exitCode}`);
      }
      
      // Add stack trace if available
      if (parsed.stack) {
        errorContent.push('');
        errorContent.push('Stack Trace:');
        const stackLines = parsed.stack.split('\n');
        errorContent.push(...stackLines);
      }
      
      const allErrorContent = errorContent.join('\n');
      const allErrorLines = allErrorContent.split('\n');
      
      // Show collapsed by default for errors too
      if (!isExpanded) {
        // Extract execution time for error display
        const executionTime = parsed.executionTime;
        const timingText = executionTime ? ` (${executionTime} ms)` : '';
        
        // Show actual error message instead of generic "Error: X lines"
        let errorSummary = 'Tool execution failed';
        if (parsed.stderr && parsed.stderr.trim()) {
          errorSummary = parsed.stderr.trim().split('\n')[0]; // First line of stderr
        } else if (parsed.error) {
          errorSummary = parsed.error.split('\n')[0]; // First line of error
        }
        
        // Truncate very long error messages for collapsed view
        if (errorSummary.length > 80) {
          errorSummary = errorSummary.substring(0, 77) + '...';
        }
        
        return (
          <Box 
            flexDirection="column" 
            marginLeft={2}
            borderStyle={isFocused ? 'single' : undefined}
            borderColor={isFocused ? 'cyan' : undefined}
            paddingX={1}
            paddingY={1}
          >
            <Box>
              <Text>
                <Text color="gray">  ⎿  </Text>
                <Text color="red">
                  {errorSummary}{timingText}
                </Text>
              </Text>
            </Box>
          </Box>
        );
      }
      
      const displayLines = allErrorLines.slice(0, 8); // Show first 8 lines for errors (more detail)
      
      return (
        <Box 
          flexDirection="column" 
          marginLeft={2}
          borderStyle={isFocused ? 'single' : undefined}
          borderColor={isFocused ? 'cyan' : undefined}
          paddingX={1}
        >
          {displayLines.map((line: string, lineIndex: number) => (
            <Box key={lineIndex}>
              {lineIndex === 0 ? (
                <Text>
                  <Text>  </Text>
                  <Text color="gray">⎿  </Text>
                  <Text color="red">{line}</Text>
                </Text>
              ) : (
                <Text>
                  <Text color="gray">   </Text>
                  <Text color="red">{line}</Text>
                </Text>
              )}
            </Box>
          ))}
          {allErrorLines.length > 8 && (
            <Box>
              <Text color="gray">   </Text>
              <Text color="blue">
                ▶ {allErrorLines.length - 8} more error lines hidden
              </Text>
            </Box>
          )}
        </Box>
      );
    } catch {
      // Fallback for non-JSON failed results (old format)
      let errorText = contentLines.join('\n');
      
      if (!errorText && header.includes('failed: ')) {
        errorText = header.split('failed: ')[1];
      }
      
      if (!errorText) {
        errorText = 'Tool execution failed';
      }
      
      const lines = errorText.trim().split('\n');
      const displayLines = lines.slice(0, 5); // Show first 5 lines
      
      return (
        <Box 
          flexDirection="column" 
          marginLeft={2}
          borderStyle={isFocused ? 'single' : undefined}
          borderColor={isFocused ? 'cyan' : undefined}
          paddingX={1}
        >
          {displayLines.map((line: string, lineIndex: number) => (
            <Box key={lineIndex}>
              {lineIndex === 0 ? (
                <Text>
                  <Text>  </Text>
                  <Text color="gray">⎿  </Text>
                  <Text color="red">{line}</Text>
                </Text>
              ) : (
                <Text>
                  <Text color="gray">   </Text>
                  <Text color="red">{line}</Text>
                </Text>
              )}
            </Box>
          ))}
          {lines.length > 5 && (
            <Box>
              <Text color="gray">   </Text>
              <Text color="blue">
                ▶ {lines.length - 5} more error lines hidden
              </Text>
            </Box>
          )}
        </Box>
      );
    }
  }
  
  // Fallback rendering
  return (
    <Box 
      marginLeft={2}
      borderStyle={isFocused ? 'single' : undefined}
      borderColor={isFocused ? 'cyan' : undefined}
      paddingX={1}
      paddingY={1}
    >
      <Text>
        <Text>  </Text>
        <Text color="gray">⎿  </Text>
        <Text>{result.split('\n')[0]}</Text>
      </Text>
    </Box>
  );
};

const StructuredToolResultRenderer: React.FC<{ 
  toolResult: ToolResult;
  isExpanded?: boolean;
  isFocused?: boolean;
  onToggle?: () => void;
}> = ({ toolResult, isExpanded = false, isFocused = false, onToggle }) => {
  
  // Helper function to check if content should be collapsed
  const shouldCollapseContent = (content: string) => {
    // Check if we have a display handler for this tool
    try {
      const context: DisplayContext = {
        toolName: toolName,
        operation: toolResult.parameters?.operation,
        parameters: toolResult.parameters || {},
        result: toolResult,
        isExpanded: false,
        isFocused: false
      };

      // Use display registry to determine collapse behavior
      if (displayRegistry.hasHandler(toolName)) {
        return displayRegistry.shouldCollapse(context);
      }
    } catch (error) {
      // Fallback to default behavior on error
      console.warn('Error checking shouldCollapse for tool:', toolName, error);
    }

    return true; // Always collapse tool results by default for unknown tools
  };

  // Get the tool name from the result ID or tool registry
  const toolName = toolResult.id.includes('_') ?
    toolResult.id.substring(0, toolResult.id.lastIndexOf('_')) :
    globalToolRegistry.getAll().find(t => t.name)?.name || 'unknown';

  if (toolResult.success) {
    // Check if we have a display handler for this tool
    if (displayRegistry.hasHandler(toolName)) {
      try {
        const context: DisplayContext = {
          toolName: toolName,
          operation: toolResult.parameters?.operation,
          parameters: toolResult.parameters || {},
          result: toolResult,
          isExpanded: isExpanded,
          isFocused: isFocused
        };

        const displayResult = displayRegistry.formatToolResult(context);

        // Use display handler's formatted content
        return (
          <Box flexDirection="column" marginLeft={2}>
            {displayResult.content.split('\n').map((line: string, lineIndex: number) => (
              <Box key={lineIndex}>
                <Text>{line}</Text>
              </Box>
            ))}
          </Box>
        );
      } catch (error) {
        console.warn('Error using display handler for tool:', toolName, error);
        // Fall through to default handling
      }
    }

    // Default handling for tools without display handlers
    let content = '';
    if (toolResult.result) {
      // For file operations, show the actual content, not JSON
      if (typeof toolResult.result === 'string') {
        content = toolResult.result;
      } else if (toolResult.result && typeof toolResult.result === 'object') {
        // If result has content property (like file read operations), show that
        if (toolResult.result.content) {
          content = toolResult.result.content;
        } else if (toolResult.result.files && Array.isArray(toolResult.result.files)) {
          // For file listing operations, format nicely
          content = toolResult.result.files.join('\n');
        } else if (toolResult.result.items && Array.isArray(toolResult.result.items)) {
          // For directory listing operations (list_dir), format as tree structure
          const formatDirectoryTree = (items: any[]) => {
            let output: string[] = [];

            items.forEach((item, index) => {
              const isLast = index === items.length - 1;
              const prefix = isLast ? '└── ' : '├── ';
              const icon = item.type === 'directory' ? '📁 ' : '📄 ';

              output.push(`${prefix}${icon}${item.name}`);
            });

            return output.join('\n');
          };

          content = formatDirectoryTree(toolResult.result.items);
        } else {
          // Fallback to JSON for other structured results
          content = JSON.stringify(toolResult.result, null, 2);
        }
      }
    }

    if (!content) return null;
    
    const shouldCollapse = shouldCollapseContent(content);
    
    // When collapsed, show specific format based on operation type
    if (shouldCollapse && !isExpanded) {
      // Extract operation info for better display (only for successful operations)
      const isReadOperation = toolResult.result?.content || (typeof toolResult.result === 'string');
      const isFileOperation = toolResult.result?.operation === 'create' || toolResult.result?.operation === 'write' || toolResult.result?.operation === 'delete';
      
      // Extract execution time for display
      const timingText = toolResult.executionTime ? ` (${toolResult.executionTime} ms)` : '';
      
      let summaryText = '';
      if (isReadOperation) {
        // For read operations, show line count
        const lines = content.split('\n').length;
        summaryText = `Read ${lines} lines${timingText}`;
      } else if (isFileOperation) {
        // For file operations, show operation summary
        const operation = toolResult.result.operation;
        const filePath = toolResult.result.file_path || toolResult.result.path || 'unknown';
        summaryText = `${operation.charAt(0).toUpperCase() + operation.slice(1)} ${filePath}${timingText}`;
      } else if (toolResult.result?.items) {
        // For directory listings
        summaryText = `Found ${toolResult.result.items.length} lines${timingText}`;
      } else {
        // Default format
        summaryText = `Found ${content.split('\n').length} lines${timingText}`;
      }
      
      return (
        <Box flexDirection="column">
          <Box>
            <Text>
              <Text color="gray">  ⎿  </Text>
              <Text color="gray">{summaryText}</Text>
            </Text>
          </Box>
        </Box>
      );
    }
    
    // When expanded, show full content (implementation similar to current ToolResultRenderer)
    return (
      <Box 
        flexDirection="column" 
        marginLeft={2}
        borderStyle={isFocused ? 'single' : undefined}
        borderColor={isFocused ? 'cyan' : undefined}
        paddingX={1}
        paddingY={1}
      >
        {content.split('\n').map((line: string, lineIndex: number) => (
          <Box key={lineIndex}>
            <Text>
              {lineIndex === 0 ? (
                <>
                  <Text>  </Text>
                  <Text bold color="green">✓</Text>
                  <Text> </Text>
                </>
              ) : (
                <Text>      </Text>
              )}
              <Text>{line}</Text>
            </Text>
          </Box>
        ))}
      </Box>
    );
  } else {
    // Handle execution errors
    const timingText = toolResult.executionTime ? ` (${toolResult.executionTime} ms)` : '';
    
    // Show actual error message instead of generic "Tool execution failed"
    let errorSummary = 'Tool execution failed';
    if (toolResult.error) {
      errorSummary = toolResult.error.split('\n')[0]; // First line of error
    }
    
    // Truncate very long error messages for collapsed view
    if (errorSummary.length > 80) {
      errorSummary = errorSummary.substring(0, 77) + '...';
    }
    
    if (!isExpanded) {
      return (
        <Box 
          flexDirection="column" 
          marginLeft={2}
          borderStyle={isFocused ? 'single' : undefined}
          borderColor={isFocused ? 'cyan' : undefined}
          paddingX={1}
          paddingY={1}
        >
          <Box>
            <Text>
              <Text color="gray">  ⎿  </Text>
              <Text color="red">
                {errorSummary}{timingText}
              </Text>
            </Text>
          </Box>
        </Box>
      );
    }
    
    // Expanded error view
    return (
      <Box 
        flexDirection="column" 
        marginLeft={2}
        borderStyle={isFocused ? 'single' : undefined}
        borderColor={isFocused ? 'cyan' : undefined}
        paddingX={1}
        paddingY={1}
      >
        <Text>
          <Text>  </Text>
          <Text bold color="red">✗</Text>
          <Text color="gray">  </Text>
          <Text color="red">{toolResult.error || 'Tool execution failed'}</Text>
        </Text>
      </Box>
    );
  }
};

export default React.memo(MessageRenderer);