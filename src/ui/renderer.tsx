import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Message } from '../types/index.js';
import MarkdownRenderer from './markdown.js';

interface MessageRendererProps {
  message: Message;
}

const MessageRenderer: React.FC<MessageRendererProps> = ({ message }) => {
  const renderUserMessage = () => (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="white">
          {'>'} {message.content}
        </Text>
      </Box>
    </Box>
  );

  const renderAssistantMessage = () => {
    console.log('🐛 DEBUG: Raw message content:', JSON.stringify(message.content.substring(0, 200)));
    console.log('🐛 DEBUG: Message content type:', typeof message.content);
    
    // Parse message content for tool calls and structured responses
    let content = '';
    let toolCalls: any[] = [];
    let reasoning = '';
    
    // Always try to parse as JSON first (since agent stores responses as JSON)
    try {
      const parsed = JSON.parse(message.content);
      console.log('🐛 DEBUG: JSON.parse successful:', parsed);
      
      if (parsed && typeof parsed === 'object') {
        content = parsed.content || '';
        toolCalls = parsed.tool_calls || [];
        reasoning = parsed.reasoning || '';
        console.log('🐛 DEBUG: Extracted content:', JSON.stringify(content));
        console.log('🐛 DEBUG: Using parsed content, should be clean text');
      } else {
        console.log('🐛 DEBUG: Parsed but not object, treating as plain text');
        content = message.content;
      }
    } catch (error) {
      console.log('🐛 DEBUG: JSON.parse failed:', error);
      console.log('🐛 DEBUG: Trying regex extraction...');
      
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
          console.log('🐛 DEBUG: Regex extracted:', JSON.stringify(extracted));
        } else {
          console.log('🐛 DEBUG: Regex extraction failed, showing error');
          content = '⚠️ Could not parse AI response. Raw content detected.';
        }
      } else {
        // Doesn't look like JSON, treat as plain text
        content = message.content;
        console.log('🐛 DEBUG: Not JSON-like, using as plain text');
      }
    }

    const renderParts = [];

    // Final safety check: Never render raw JSON to the user
    // This should only trigger if something went very wrong
    if (content && content.trim().startsWith('{') && content.includes('"content"') && content.includes('"tool_calls"')) {
      console.log('🐛 DEBUG: SAFETY CHECK TRIGGERED - This should not happen if parsing worked correctly');
      console.log('🐛 DEBUG: Content that triggered safety check:', JSON.stringify(content.substring(0, 100)));
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
      toolCalls.forEach((call, index) => {
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
          <Box key={`tool-${index}`} flexDirection="column" marginBottom={1}>
            <Text>
              <Text color="blue">⏺</Text> {call.name}({paramDisplay})
            </Text>
            <Box marginLeft={2}>
              <Text color="gray">
                ⎿  Executing...
              </Text>
            </Box>
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
          {toolResults.map((result, index) => {
            if (result.includes('succeeded:')) {
              const [header, ...contentLines] = result.split('\n');
              const jsonContent = contentLines.join('\n');
              
              try {
                const parsed = JSON.parse(jsonContent);
                if (parsed.success && parsed.stdout) {
                  return (
                    <Box key={index} flexDirection="column">
                      <Box marginLeft={2}>
                        <Text color="gray">⎿  </Text>
                        <Box flexGrow={1}>
                          <MarkdownRenderer content={parsed.stdout.trim()} />
                        </Box>
                      </Box>
                    </Box>
                  );
                }
                if (parsed.success && parsed.result) {
                  const resultStr = typeof parsed.result === 'string' 
                    ? parsed.result 
                    : JSON.stringify(parsed.result, null, 2);
                  
                  const lines = resultStr.split('\n');
                  return (
                    <Box key={index} flexDirection="column">
                      <Box marginLeft={2}>
                        <Text color="gray">⎿  </Text>
                        <Box flexGrow={1}>
                          <MarkdownRenderer content={lines[0]} />
                        </Box>
                      </Box>
                      {lines.length > 1 && (
                        <Box marginLeft={2}>
                          <Text color="gray">
                            … +{lines.length - 1} lines (ctrl+r to expand)
                          </Text>
                        </Box>
                      )}
                    </Box>
                  );
                }
              } catch {
                // Fallback for non-JSON results
              }
            }
            
            // Fallback rendering
            return (
              <Box key={index} marginLeft={2}>
                <Text color="gray">
                  ⎿  {result.split('\n')[0]}
                </Text>
              </Box>
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

export default MessageRenderer;