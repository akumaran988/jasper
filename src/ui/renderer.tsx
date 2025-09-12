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
          content = '⚠️ Could not parse AI response. Raw content detected.';
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
      content = '⚠️ AI response parsing error. Please try restarting Jasper.';
    }

    // Main content with Claude Code-style bullet (white bullet for AI responses)
    if (content && content.trim()) {
      renderParts.push(
        <Box key="content" flexDirection="column" marginBottom={1}>
          <Box flexDirection="column">
            <Box>
              <Text color="white">⏺ </Text>
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
        // Format parameters more cleanly like Claude Code
        const paramDisplay = Object.entries(call.parameters || {})
          .map(([k, v]) => {
            if (typeof v === 'string' && v.length > 50) {
              return `${k}="${v.substring(0, 47)}..."`;
            }
            return `${k}=${JSON.stringify(v)}`;
          })
          .join(', ');
        
        // Find the corresponding tool result in the next system message
        let toolResult = null;
        if (index + 1 < messages.length && messages[index + 1].role === 'system' && 
            messages[index + 1].content.startsWith('Tool execution results:')) {
          const resultsContent = messages[index + 1].content.replace('Tool execution results:\n', '');
          const allResults = resultsContent.split('\n\n');
          
          // Find the result that matches this tool call ID
          toolResult = allResults.find(result => result.includes(call.id));
        }
        
        renderParts.push(
          <Box key={`tool-${toolIndex}`} flexDirection="column" marginBottom={1}>
            <Text>
              <Text color="blue">⏺</Text> <Text bold color="white">{call.name}</Text>({paramDisplay})
            </Text>
            {toolResult && (
              <Box marginLeft={2} marginTop={1}>
                <ToolResultRenderer 
                  result={toolResult}
                  displayNumber={toolIndex + 1}
                  isExpanded={expandedToolResults?.has(`${index}-${toolIndex}`) || false}
                  isFocused={focusedToolResult === `${index}-${toolIndex}`}
                  onToggle={onToggleExpansion ? () => onToggleExpansion(`${index}-${toolIndex}`) : undefined}
                />
              </Box>
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
        <Box flexDirection="column" marginBottom={1}>
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
  const shouldCollapseContent = (content: string) => {
    const lines = content.split('\n');
    return lines.length > 5 || content.length > 200;
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
              // For file update operations (including update_lines), show the diff
              const formatDiff = (diff: any) => {
                let output: string[] = [];
                output.push(`📝 ${parsed.result.message || 'File updated'}`);
                output.push('');
                output.push('📋 Changes:');
                
                if (typeof diff === 'string') {
                  // Handle unified diff format
                  output.push(diff);
                } else if (diff.added || diff.removed || diff.lines) {
                  if (diff.lines) {
                    diff.lines.forEach((line: any) => {
                      if (line.added) {
                        output.push(`+ ${line.value || line.content || line}`);
                      } else if (line.removed) {
                        output.push(`- ${line.value || line.content || line}`);
                      } else {
                        output.push(`  ${line.value || line.content || line}`);
                      }
                    });
                  } else {
                    if (diff.removed) {
                      output.push('🔴 Removed:');
                      output.push(`- ${diff.removed}`);
                    }
                    if (diff.added) {
                      output.push('🟢 Added:');
                      output.push(`+ ${diff.added}`);
                    }
                  }
                }
                
                return output.join('\n');
              };
              
              content = formatDiff(parsed.result.diff);
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
        const displayContent = shouldCollapse && !isExpanded ? getTruncatedContent(content) : content;
        
        // Check if content already has line numbers (from fileops tool)
        const hasExistingLineNumbers = /^\s*\d+\s/.test(content.split('\n')[0]);
        
        // Add line numbers for file content (when content looks like file content)
        // Don't add line numbers for diffs, operation summaries, directory listings, or content that already has line numbers
        const isFileContent = !hasExistingLineNumbers && content.includes('\n') && (
          parsed.result?.content || // File read operation
          (typeof parsed.result === 'string' && content.split('\n').length > 3) // Multi-line string content
        ) && !parsed.result?.operation && !content.includes('📝 File') && !content.includes('🗑️ File') && !content.includes('📄 File') && !content.includes('├── ') && !content.includes('└── ');
        
        let displayLines = displayContent.split('\n');
        
        
        return (
          <Box 
            flexDirection="column" 
            marginLeft={2}
            marginBottom={1}
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
                      {displayNumber && (
                        <Text color="cyan" dimColor>[{displayNumber}] </Text>
                      )}
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
            {shouldCollapse && (
              <Box>
                <Text color="gray">   </Text>
                <Text color="cyan" dimColor>
                  {!isExpanded 
                    ? `▶ ${content.length > 200 ? `${Math.max(0, content.length - 200)} more chars` : `${Math.max(0, content.split('\n').length - 5)} more lines`} hidden - Press Ctrl+E to expand`
                    : `▼ Expanded - Press Ctrl+E to collapse`
                  }
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
            marginBottom={1}
            borderStyle={isFocused ? 'single' : undefined}
            borderColor={isFocused ? 'cyan' : undefined}
            paddingX={1}
            paddingY={1}
          >
            {displayLines.map((line: string, lineIndex: number) => (
              <Box key={lineIndex}>
                {lineIndex === 0 ? (
                  <Text>
                    {displayNumber && (
                      <Text color="cyan" dimColor>[{displayNumber}] </Text>
                    )}
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
            {displayNumber && (
              <Text color="cyan" dimColor>[{displayNumber}] </Text>
            )}
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
      
      const allErrorLines = errorContent.join('\n').split('\n');
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
                  {displayNumber && (
                    <Text color="cyan" dimColor>[{displayNumber}] </Text>
                  )}
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
                  {displayNumber && (
                    <Text color="cyan" dimColor>[{displayNumber}] </Text>
                  )}
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
        {displayNumber && (
          <Text color="cyan" dimColor>[{displayNumber}] </Text>
        )}
        <Text color="gray">⎿  </Text>
        <Text>{result.split('\n')[0]}</Text>
      </Text>
    </Box>
  );
};

export default React.memo(MessageRenderer);