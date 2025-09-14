import React from 'react';
import { Box, Text } from 'ink';

const WelcomeMessage: React.FC = () => {
  return (
    <Box flexDirection="column" marginBottom={2}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">
          ┌─────────────────────────────────────────────────────────────┐
        </Text>
        <Text bold color="cyan">
          │                                                             │
        </Text>
        <Text bold color="cyan">
          │  Welcome to <Text bold color="white">Jasper</Text> - Your AI Assistant             │
        </Text>
        <Text bold color="cyan">
          │                                                             │
        </Text>
        <Text bold color="cyan">
          └─────────────────────────────────────────────────────────────┘
        </Text>
      </Box>

      {/* Features */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="white" bold>✨ Features:</Text>
        <Text color="gray">  • AI-powered conversations with tool calling capabilities</Text>
        <Text color="gray">  • File operations (read, write, edit, search)</Text>
        <Text color="gray">  • Command execution and system interaction</Text>
        <Text color="gray">  • Full conversation history with smart scrolling</Text>
        <Text color="gray">  • Markdown rendering optimized for terminal</Text>
      </Box>

      {/* Quick Start */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="white" bold>🚀 Quick Start:</Text>
        <Text color="gray">  • Type your question or request and press Enter</Text>
        <Text color="gray">  • Use <Text color="cyan">/help</Text> to see available commands</Text>
        <Text color="gray">  • Use <Text color="cyan">/compact</Text> to summarize conversation history</Text>
        <Text color="gray">  • Press <Text color="cyan">Ctrl+C</Text> to exit</Text>
      </Box>

      {/* Navigation */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="white" bold>⌨️  Navigation:</Text>
        <Text color="gray">  • <Text color="cyan">Page Up/Down</Text> - Scroll through messages</Text>
        <Text color="gray">  • <Text color="cyan">Ctrl+End</Text> - Jump to latest message</Text>
      </Box>

      {/* Footer */}
      <Box flexDirection="column">
        <Text color="gray" dimColor>
          Ready to assist! Type your first message below.
        </Text>
        <Text color="gray" dimColor>
          Powered by AI • Built with ❤️  • Version 1.0.0
        </Text>
      </Box>
    </Box>
  );
};

export default WelcomeMessage;