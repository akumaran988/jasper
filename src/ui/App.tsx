import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ConversationContext, PermissionContext, PermissionResponse, PermissionRule } from '../types/index.js';
import { MainContent } from './components/MainContent.js';
import InputHandler from './input.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import CompactionIndicator from './components/CompactionIndicator.js';

interface AppProps {
  context: ConversationContext;
  onMessage: (message: string) => Promise<void>;
  isProcessing: boolean;
  isCompacting?: boolean;
  pendingPermission?: PermissionContext | null;
  onPermissionResponse?: (response: PermissionResponse) => void;
  sessionApprovals?: Map<string, PermissionRule>;
  onClearConversation?: () => void;
  onCompactConversation?: () => void;
  // UI State props
  terminalWidth: number;
  terminalHeight: number;
  mainAreaWidth: number;
  constrainHeight: boolean;
  historyRemountKey: number;
  availableHeight?: number;
  input: string;
  onInputChange: (input: string) => void;
  cursorPosition: number;
  pasteBlocks: Array<{start: number, end: number, content: string}>;
}

export const App: React.FC<AppProps> = ({
  context,
  onMessage,
  isProcessing,
  isCompacting = false,
  pendingPermission,
  onPermissionResponse,
  sessionApprovals = new Map(),
  onClearConversation,
  onCompactConversation,
  terminalWidth,
  terminalHeight,
  mainAreaWidth,
  constrainHeight,
  historyRemountKey,
  availableHeight,
  input,
  onInputChange,
  cursorPosition,
  pasteBlocks
}) => {
  const streamingContext = useStreamingContext();

  return (
    <Box flexDirection="column" width="90%">
      <MainContent
        context={context}
        terminalWidth={terminalWidth}
        terminalHeight={terminalHeight}
        mainAreaWidth={mainAreaWidth}
        staticAreaMaxItemHeight={Math.max(terminalHeight * 50, 20000)}
        availableTerminalHeight={availableHeight}
        constrainHeight={constrainHeight}
        historyRemountKey={historyRemountKey}
      />

      {/* Controls Area */}
      <Box flexDirection="column">
        {/* Permission Selector */}
        {pendingPermission && (
          <PermissionSelector 
            pendingPermission={pendingPermission}
            sessionApprovals={sessionApprovals}
            onPermissionResponse={onPermissionResponse}
          />
        )}

        {/* Processing Indicators - Compacting has priority */}
        {(isCompacting || context.isCompacting) && !pendingPermission ? (
          <CompactionIndicator isVisible={true} stage="summarizing" />
        ) : isProcessing && !pendingPermission ? (
          <ProcessingIndicator />
        ) : null}

        {/* Input Handler */}
        {!pendingPermission && (
          <>
            <InputHandler 
              input={input} 
              onInputChange={onInputChange} 
              cursorPosition={cursorPosition}
              pasteBlocks={pasteBlocks}
            />
            {/* Token Usage Indicator */}
            <Box marginTop={0} marginLeft={2}>
              <Text color="gray" dimColor>
                Tokens: {Math.round((context.tokenCount / 10000) * 100)}%
                {context.compactedSummary && (
                  <Text color="yellow"> (compacted)</Text>
                )}
              </Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

// Fun processing indicators with quirky messages
const ProcessingIndicator = () => {
  const messages = [
    "Brewing some digital magic...",
    "Crunching ones and zeros...",
    "Consulting the silicon oracle...",
    "Spinning up the neural hamsters...",
    "Tickling the algorithms...",
    "Awakening the code spirits...",
    "Summoning computational wisdom...",
    "Dancing with data patterns...",
    "Whispering to the machines...",
    "Channeling the tech muses..."
  ];
  
  const message = messages[Math.floor(Math.random() * messages.length)];
  
  return (
    <Box marginTop={1}>
      <Text color="cyan">
        <Spinner type="dots" /> {message}
      </Text>
    </Box>
  );
};


const PermissionSelector = ({ pendingPermission, sessionApprovals, onPermissionResponse }: any) => {
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
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
      {sessionApprovals && sessionApprovals.size > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="green">
            ℹ️ Current session approvals:
          </Text>
          {Array.from(sessionApprovals.values()).map((rule: any, index: number) => (
            <Text key={index} color="gray">
              • {rule.toolName} {rule.scope === 'folder' ? `(${rule.scopeValue})` : 
                                rule.scope === 'domain' ? `(${rule.scopeValue})` : ''}
            </Text>
          ))}
        </Box>
      )}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray">Choose an option:</Text>
      </Box>
      <Box flexDirection="column">
        <Text color="green">
          <Text bold color="green">(Y)</Text> Yes (just this time)
        </Text>
        <Text color="blue">
          <Text bold color="blue">(S)</Text> Yes, for this session
        </Text>
        <Text color="red">
          <Text bold color="red">(N)</Text> No, let me give different instructions
        </Text>
      </Box>
    </Box>
  );
};