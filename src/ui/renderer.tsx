import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Message } from '../types/index.js';
import MarkdownRenderer from './markdown.js';
import { displayRegistry } from '../display/registry.js';
import { DisplayContext } from '../display/types.js';

interface MessageRendererProps {
  message: Message;
  messages: Message[];
  index: number;
  expandedToolResults?: Set<string>;
  focusedToolResult?: string | null;
  onToggleExpansion?: (resultKey: string) => void;
  onFocusToolResult?: (resultKey: string) => void;
  toolResultPage?: number;
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
  const renderUserMessage = () => {
    // Split user message into lines to preserve multi-line formatting
    const userLines = message.content.split(/\r\n|\r|\n/);
    
    return (
      <Box flexDirection="column" marginBottom={1}>
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

    // Main content with Claude Code-style bullet (white bullet for AI responses, red for errors)
    if (content && content.trim()) {
      const isError = content.includes('⚠️  AI response parsing error') || content.includes('⚠️  Could not parse AI response');
      renderParts.push(
        <Box key="content" flexDirection="column" marginBottom={0}>
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
        // Format parameters cleanly - show only the main parameter (usually file_path)
        let paramDisplay = '';
        const params = call.parameters || {};
        
        // For file operations, show only the file path
        if (params.file_path) {
          paramDisplay = params.file_path;
        } else if (params.path) {
          paramDisplay = params.path;
        } else if (params.pattern && call.name.toLowerCase().includes('search')) {
          // For search operations, show the pattern
          paramDisplay = `pattern: "${params.pattern}"`;
          if (params.output_mode) {
            paramDisplay += `, output_mode: "${params.output_mode}"`;
          }
        } else if (params.command && call.name.toLowerCase().includes('bash')) {
          // For bash operations, show the command
          paramDisplay = params.command.length > 50 ? `${params.command.substring(0, 47)}...` : params.command;
        } else {
          // Fallback to original format for other tools
          paramDisplay = Object.entries(params)
            .map(([k, v]) => {
              if (typeof v === 'string' && v.length > 50) {
                return `${k}="${v.substring(0, 47)}..."`;
              }
              return `${k}=${JSON.stringify(v)}`;
            })
            .join(', ');
        }
        
        // Find the corresponding tool result in the next system message
        let toolResult = null;
        if (index + 1 < messages.length && messages[index + 1].role === 'system' && 
            messages[index + 1].content.startsWith('Tool execution results:')) {
          const resultsContent = messages[index + 1].content.replace('Tool execution results:\n', '');
          const allResults = resultsContent.split('\n\n');
          
          // Find the result that matches this tool call ID
          toolResult = allResults.find(result => result.includes(call.id));
        }
        
        // Format tool name for display (e.g., "Edit" -> "Update" for file updates)
        let displayName = call.name;
        if (call.name === 'Edit' || call.name === 'MultiEdit') {
          displayName = 'Update';
        }

        renderParts.push(
          <Box key={`tool-${toolIndex}`} flexDirection="column" marginBottom={0}>
            <Text>
              <Text color="blue">⏺</Text> <Text bold color="white">{displayName}</Text>({paramDisplay})
            </Text>
            {toolResult && (
              <ToolResultRenderer 
                result={toolResult}
                displayNumber={toolIndex + 1}
                isExpanded={expandedToolResults?.has(`${index}-${toolIndex}`) || false}
                isFocused={focusedToolResult === `${index}-${toolIndex}`}
                onToggle={onToggleExpansion ? () => onToggleExpansion(`${index}-${toolIndex}`) : undefined}
              />
            )}
          </Box>
        );
      });
    }

    return (
      <Box flexDirection="column">
        {renderParts}
      </Box>
    );
  };

  const renderSystemMessage = () => {
    // Handle tool results exactly like Claude Code
    if (message.content.startsWith('Tool execution results:')) {
      // Check if this tool result message immediately follows an assistant message with tool calls
      // If so, skip rendering it here as it's already rendered with the tool calls
      if (index > 0 && messages[index - 1].role === 'assistant') {
        try {
          const prevMessage = JSON.parse(messages[index - 1].content);
          if (prevMessage.tool_calls && prevMessage.tool_calls.length > 0) {
            // Skip rendering - this is handled by the assistant message renderer
            return null;
          }
        } catch {
          // If parsing fails, continue with normal rendering
        }
      }
      
      const results = message.content.replace('Tool execution results:\n', '');
      
      // Parse individual tool results
      const toolResults = results.split('\n\n');
      
      return (
        <Box flexDirection="column" marginBottom={0}>
          {toolResults.map((result, resultIndex) => {
            const resultKey = `${index}-${resultIndex}`;
            
            // Calculate the global index for this tool result
            let globalIndex = 0;
            for (let i = 0; i < messages.length; i++) {
              if (messages[i].role === 'system' && messages[i].content.startsWith('Tool execution results:')) {
                if (i < index) {
                  const otherResults = messages[i].content.replace('Tool execution results:\n', '').split('\n\n');
                  globalIndex += otherResults.length;
                } else if (i === index) {
                  globalIndex += resultIndex;
                  break;
                }
              }
            }
            
            // Use the SAME logic as getAllToolResultKeys to ensure sync
            let displayNumber = 0;
            const allKeys: string[] = [];
            
            // Build the same array as getAllToolResultKeys
            messages.forEach((msg, msgIndex) => {
              if (msg.role === 'system' && msg.content.startsWith('Tool execution results:')) {
                const results = msg.content.replace('Tool execution results:\n', '').split('\n\n');
                results.forEach((_, resultIdx) => {
                  allKeys.push(`${msgIndex}-${resultIdx}`);
                });
              }
            });
            
            // Find this result's position in the array
            const currentKey = `${index}-${resultIndex}`;
            const position = allKeys.indexOf(currentKey);
            if (position !== -1 && position < 9) {
              displayNumber = position + 1; // 1-based numbering
            }
            
            return (
              <ToolResultRenderer 
                key={resultIndex} 
                result={result} 
                displayNumber={displayNumber} // Show 1-9 for selectable results
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
  displayNumber?: number;
  isExpanded?: boolean;
  isFocused?: boolean;
  onToggle?: () => void;
}> = ({ result, displayNumber, isExpanded = false, isFocused = false, onToggle }) => {
  
  // Helper function to check if content should be collapsed
  // ALL tool results should be collapsed by default
  const shouldCollapseContent = (content: string) => {
    return true; // Always collapse tool results by default
  };

  // Helper function to extract tool information from result
  const extractToolInfo = (result: string): { toolName: string; operation?: string; parameters: Record<string, any> } | null => {
    if (!result.includes('succeeded:')) {
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
  if (result.includes('succeeded:')) {
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
          // Extract operation info for better display
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
            
            summaryText = `Updated ${filePath} with ${additions} additions and ${removals} removals`;
          } else if (isReadOperation) {
            // For read operations, show line count
            const lines = content.split('\n').length;
            summaryText = `Read ${lines} lines (ctrl+e to expand)`;
          } else if (isFileOperation) {
            // For file operations, show operation summary
            const operation = parsed.result.operation;
            const filePath = parsed.result.file_path || parsed.result.path || 'unknown';
            summaryText = `${operation.charAt(0).toUpperCase() + operation.slice(1)} ${filePath}`;
          } else {
            // Default format
            summaryText = `Found ${content.split('\n').length} lines (ctrl+e to expand)`;
          }
          
          return (
            <Box 
              flexDirection="column" 
              marginLeft={2}
              marginBottom={0}
              borderStyle={isFocused ? 'single' : undefined}
              borderColor={isFocused ? 'cyan' : undefined}
              paddingX={1}
              paddingY={1}
            >
              <Box>
                <Text>
                  <Text color="gray">⎿  </Text>
                  <Text color="white">
                    {summaryText}
                  </Text>
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
        
        
        return (
          <Box 
            flexDirection="column" 
            marginLeft={2}
            marginBottom={0}
            borderStyle={isFocused ? 'single' : undefined}
            borderColor={isFocused ? 'cyan' : undefined}
            paddingX={1}
            paddingY={1}
          >
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
        const displayLines = allErrorLines.slice(0, 8); // Show first 8 lines for errors (more detail)
        
        return (
          <Box 
            flexDirection="column" 
            marginLeft={2}
            marginBottom={0}
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
          marginBottom={1}
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
  if (result.includes('failed:')) {
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
        return (
          <Box 
            flexDirection="column" 
            marginLeft={2}
            marginBottom={0}
            borderStyle={isFocused ? 'single' : undefined}
            borderColor={isFocused ? 'cyan' : undefined}
            paddingX={1}
            paddingY={1}
          >
            <Box>
              <Text>
                {displayNumber && (
                  <Text color="cyan" dimColor>[{displayNumber}] </Text>
                )}
                <Text color="gray">⎿  </Text>
                <Text color="white">
                  Error: {allErrorLines.length} lines (ctrl+e to expand)
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
      marginBottom={1}
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

export default React.memo(MessageRenderer);