import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface CompactionIndicatorProps {
  isVisible: boolean;
  stage?: 'extracting' | 'summarizing' | 'finalizing';
  progress?: number; // 0-100
}

export const CompactionIndicator: React.FC<CompactionIndicatorProps> = ({ 
  isVisible, 
  stage = 'summarizing',
  progress = 0
}) => {
  if (!isVisible) return null;

  const getStageText = () => {
    switch (stage) {
      case 'extracting':
        return 'Extracting conversation data...';
      case 'summarizing':
        return 'Generating conversation summary...';
      case 'finalizing':
        return 'Finalizing compaction...';
      default:
        return 'Compacting conversation...';
    }
  };

  const getProgressBar = () => {
    const total = 20;
    const filled = Math.round((progress / 100) * total);
    const empty = total - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1} marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="yellow" bold>🔄 Compacting Conversation</Text>
      </Box>
      
      <Box marginBottom={1}>
        <Spinner type="dots" />
        <Text color="gray"> {getStageText()}</Text>
      </Box>
      
      {progress > 0 && (
        <Box>
          <Text color="cyan">[{getProgressBar()}] {progress.toFixed(0)}%</Text>
        </Box>
      )}
      
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          This may take a few moments as we summarize your conversation...
        </Text>
      </Box>
    </Box>
  );
};

export default CompactionIndicator;