import { Box, Text, Static } from 'ink';
import MessageRenderer from '../renderer.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { useStreamingContext } from '../../contexts/StreamingContext.js';
import { ConversationContext, Message } from '../../types/index.js';
import WelcomeMessage from '../welcome.js';

interface MainContentProps {
  context: ConversationContext;
  terminalWidth: number;
  terminalHeight: number;
  mainAreaWidth: number;
  staticAreaMaxItemHeight: number;
  availableTerminalHeight?: number;
  constrainHeight: boolean;
  historyRemountKey: number;
}

export const MainContent = ({
  context,
  terminalWidth,
  terminalHeight,
  mainAreaWidth,
  staticAreaMaxItemHeight,
  availableTerminalHeight,
  constrainHeight,
  historyRemountKey
}: MainContentProps) => {
  const streamingContext = useStreamingContext();

  // Filter messages from allMessages to show compaction tool calls
  const filteredMessages = context.allMessages.filter(m => 
    m.role !== 'system' || m.content.startsWith('Tool execution results:')
  );

  // Separate completed messages from streaming message
  const completedMessages = [...filteredMessages];
  const pendingMessages: Message[] = [];
  
  // Add streaming message if active
  if (streamingContext.isStreaming && streamingContext.currentMessage) {
    pendingMessages.push({
      role: 'assistant' as const,
      content: streamingContext.currentMessage.content,
      timestamp: streamingContext.currentMessage.timestamp
    });
  }

  return (
    <>
      {/* Welcome Message - only show when no conversation */}
      {context.messages.length === 0 && (
        <Box marginTop={1}>
          <WelcomeMessage />
        </Box>
      )}


      {/* Completed Messages - Use Static component like gemini-cli */}
      {/* Only remount when historyRemountKey changes due to terminal resize */}
      <Static
        key={`static-${historyRemountKey}`}
        items={completedMessages.map((message, index) => {
          // Create stable unique key based on message content and position
          const messageKey = `msg-${index}-${message.timestamp?.getTime() || index}-${message.content?.slice(0, 50) || ''}`;
          return {
            key: messageKey,
            component: (
              <MessageRenderer
                message={message}
                messages={context.messages}
                index={index}
                terminalWidth={mainAreaWidth}
                availableTerminalHeight={staticAreaMaxItemHeight}
              />
            )
          };
        })}
      >
        {(item) => <Box key={item.key} marginBottom={1}>{item.component}</Box>}
      </Static>

      {/* Pending Messages - Dynamic container like gemini-cli */}
      <OverflowProvider>
        <Box flexDirection="column">
          {pendingMessages.map((message, index) => {
            const globalIndex = completedMessages.length + index;
            return (
              <Box key={`pending-${streamingContext.currentMessage?.id}`}>
                <Box borderStyle="single" borderColor="cyan" paddingX={1}>
                  <MessageRenderer
                    message={message}
                    messages={[...context.messages, message]}
                    index={globalIndex}
                    terminalWidth={mainAreaWidth}
                    availableTerminalHeight={
                      constrainHeight ? availableTerminalHeight : undefined
                    }
                    isPending={true}
                    isStreaming={true}
                  />
                  {streamingContext.currentMessage?.isPartial && (
                    <Text color="gray"> ▊</Text>
                  )}
                </Box>
              </Box>
            );
          })}
          <ShowMoreLines constrainHeight={constrainHeight} />
        </Box>
      </OverflowProvider>
    </>
  );
};