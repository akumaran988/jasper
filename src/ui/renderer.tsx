import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Message } from '../types/index.js';
import MarkdownRenderer from './markdown.js';

interface MessageRendererProps {
  message: Message;
  messages: Message[];
  index: number;
}

const MessageRenderer: React.FC<MessageRendererProps> = ({ message, messages, index }) => {
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
              <Box flexGrow={1}>
                <MarkdownRenderer content={content} />
              </Box>
            </Box>
          </Box>
        </Box>
      );
    }

    // Tool calls with Claude Code-style formatting
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
        
        renderParts.push(
          <Box key={`tool-${toolIndex}`} flexDirection="column" marginBottom={1}>
            <Text>
              <Text color="blue">⏺</Text> {call.name}({paramDisplay})
            </Text>
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
      const results = message.content.replace('Tool execution results:\n', '');
      
      // Parse individual tool results
      const toolResults = results.split('\n\n');
      
      return (
        <Box flexDirection="column" marginBottom={1}>
          {toolResults.map((result, index) => (
            <ToolResultRenderer key={index} result={result} />
          ))}
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

const ToolResultRenderer: React.FC<{ result: string }> = ({ result }) => {
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
          content = typeof parsed.result === 'string' 
            ? parsed.result 
            : JSON.stringify(parsed.result, null, 2);
        }
        
        if (!content) return null;
        
        const lines = content.split('\n');
        const displayLines = lines.slice(0, 5); // Show first 5 lines
        
        return (
          <Box flexDirection="column" marginLeft={2}>
            {displayLines.map((line: string, lineIndex: number) => (
              <Box key={lineIndex}>
                <Text color="gray">{lineIndex === 0 ? '⎿  ' : '   '}</Text>
                <Text>{line}</Text>
              </Box>
            ))}
            {lines.length > 5 && (
              <Box>
                <Text color="gray">   </Text>
                <Text color="blue">
                  ▶ {lines.length - 5} more lines hidden
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
          <Box flexDirection="column" marginLeft={2}>
            {displayLines.map((line: string, lineIndex: number) => (
              <Box key={lineIndex}>
                <Text color="gray">{lineIndex === 0 ? '⎿  ' : '   '}</Text>
                <Text color="red">{line}</Text>
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
        <Box marginLeft={2}>
          <Text color="gray">⎿  </Text>
          <Text color="red">Failed to parse tool result</Text>
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
        <Box flexDirection="column" marginLeft={2}>
          {displayLines.map((line: string, lineIndex: number) => (
            <Box key={lineIndex}>
              <Text color="gray">{lineIndex === 0 ? '⎿  ' : '   '}</Text>
              <Text color="red">{line}</Text>
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
        <Box flexDirection="column" marginLeft={2}>
          {displayLines.map((line: string, lineIndex: number) => (
            <Box key={lineIndex}>
              <Text color="gray">{lineIndex === 0 ? '⎿  ' : '   '}</Text>
              <Text color="red">{line}</Text>
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
    <Box marginLeft={2}>
      <Text color="gray">⎿  </Text>
      <Text>{result.split('\n')[0]}</Text>
    </Box>
  );
};

export default MessageRenderer;