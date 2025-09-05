import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Message, ConversationContext } from '../types/index.js';
import MessageRenderer from './renderer.js';
import InputHandler from './input.js';

interface TerminalProps {
  context: ConversationContext;
  onMessage: (message: string) => Promise<void>;
  isProcessing: boolean;
  pendingPermission?: {
    toolCall: any;
    resolve: (approved: boolean) => void;
  } | null;
  onPermissionResponse?: (approved: boolean) => void;
}

const Terminal: React.FC<TerminalProps> = ({ 
  context, 
  onMessage, 
  isProcessing, 
  pendingPermission, 
  onPermissionResponse 
}) => {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [showInput, setShowInput] = useState(true);

  useInput((input: string, key: any) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    // Handle permission responses
    if (pendingPermission) {
      if (input === 'y' || input === 'Y') {
        onPermissionResponse?.(true);
        return;
      }
      if (input === 'n' || input === 'N') {
        onPermissionResponse?.(false);
        return;
      }
      // Ignore all other keys during permission prompt
      return;
    }

    if (key.return) {
      if (key.shift && !isProcessing && !pendingPermission) {
        // Shift+Enter for new line
        setInput(prev => prev + '\n');
        return;
      } else if (!isProcessing && !pendingPermission) {
        // Regular Enter to submit
        handleSubmit();
        return;
      }
    }

    if (key.backspace || key.delete) {
      if (!pendingPermission) {
        setInput(prev => {
          if (prev.length === 0) return prev;
          
          // Handle backspace with newlines
          if (prev.endsWith('\n')) {
            return prev.slice(0, -1);
          } else {
            return prev.slice(0, -1);
          }
        });
      }
      return;
    }

    if (!key.ctrl && !key.meta && !pendingPermission && input.length === 1) {
      setInput(prev => prev + input);
    }
  });

  const handleSubmit = useCallback(async () => {
    if (input.trim() && !isProcessing) {
      const message = input.trim();
      setInput('');
      setShowInput(false);
      await onMessage(message);
      setShowInput(true);
    }
  }, [input, isProcessing, onMessage]);

  return (
    <Box flexDirection="column" minHeight={3}>
      {/* Header - Claude Code style */}
      {context.messages.length === 0 && (
        <Box flexDirection="column" marginBottom={2}>
          <Text color="white" bold>
            ✻ Welcome to Jasper!
          </Text>
          <Text></Text>
          <Text color="gray">
            /help for help, /status for your current setup
          </Text>
          <Text></Text>
          <Text color="gray">
            cwd: {process.cwd()}
          </Text>
          <Text></Text>
          <Text color="white" bold>
            Tips for getting started:
          </Text>
          <Text></Text>
          <Text color="gray">
            1. Ask Jasper to create a new app or clone a repository
          </Text>
          <Text color="gray">
            2. Use Jasper to help with file analysis, editing, bash commands and git
          </Text>
          <Text color="gray">
            3. Be as specific as you would with another engineer for the best results
          </Text>
          <Text color="gray">
            4. ✔ Run /terminal-setup to set up terminal integration
          </Text>
          <Text></Text>
        </Box>
      )}

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1}>
        {context.messages.filter(m => m.role !== 'system' || m.content.startsWith('Tool execution results:')).map((message, index) => (
          <MessageRenderer key={index} message={message} messages={context.messages} index={context.messages.findIndex(m => m === message)} />
        ))}
      </Box>

      {/* Permission prompt */}
      {pendingPermission && (
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          <Box marginBottom={1}>
            <Text color="yellow" bold>
              🔐 Permission Required
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text>
              Tool: <Text color="cyan" bold>{pendingPermission.toolCall.name}</Text>
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text>
              Command: <Text color="gray">{JSON.stringify(pendingPermission.toolCall.parameters)}</Text>
            </Text>
          </Box>
          <Box>
            <Text color="white">
              Allow this tool to execute? <Text color="green" bold>(Y)</Text>es / <Text color="red" bold>(N)</Text>o
            </Text>
          </Box>
        </Box>
      )}

      {/* Processing indicator */}
      {isProcessing && !pendingPermission && (
        <Box marginTop={1}>
          <Text color="yellow">
            ✽ Swirling... (esc to interrupt)
          </Text>
        </Box>
      )}

      {/* Input */}
      {showInput && !isProcessing && !pendingPermission && (
        <InputHandler input={input} onInputChange={setInput} />
      )}

      {/* Status bar at bottom */}
      <Box marginTop={1} justifyContent="flex-end">
        <Text color="gray" dimColor>
          {pendingPermission 
            ? '⏵⏵ awaiting permission (Y/N to respond)'
            : isProcessing 
            ? `⏵⏵ processing (${context.currentIteration}/${context.maxIterations})` 
            : '⏵⏵ ready (ctrl+c to exit)'
          }
        </Text>
      </Box>
    </Box>
  );
};

export default Terminal;