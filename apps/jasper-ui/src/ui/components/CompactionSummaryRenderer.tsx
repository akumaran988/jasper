import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { CompactionResult } from '../../types/index.js';

interface CompactionSummaryRendererProps {
  compactionResult: CompactionResult;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const CompactionSummaryRenderer: React.FC<CompactionSummaryRendererProps> = ({ 
  compactionResult,
  isExpanded = false,
  onToggleExpand
}) => {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = onToggleExpand ? isExpanded : localExpanded;
  const toggleExpand = onToggleExpand || (() => setLocalExpanded(!localExpanded));

  const formatTokenReduction = () => {
    const reduction = compactionResult.originalTokens - compactionResult.compactedTokens;
    const percentage = ((reduction / compactionResult.originalTokens) * 100).toFixed(1);
    return `${reduction} tokens (${percentage}% reduction)`;
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ===================== Previous Conversation Compacted =====================
        </Text>
      </Box>

      {/* Expandable Summary */}
      <Box 
        flexDirection="column" 
        borderStyle="single" 
        borderColor="gray" 
        paddingX={2} 
        paddingY={1}
      >
        {/* Summary line with expand indicator */}
        <Box marginBottom={expanded ? 1 : 0}>
          <Text color="yellow">⏺</Text>
          <Text color="white"> Compact summary </Text>
          <Text color="gray">(ctrl+r to {expanded ? 'collapse' : 'expand'})</Text>
        </Box>

        {/* Conversational Summary (always visible when expanded) */}
        {expanded && (
          <Box flexDirection="column" marginBottom={2}>
            <Box marginBottom={1}>
              <Text color="cyan" bold>📝 What happened:</Text>
            </Box>
            <Box marginLeft={2}>
              <Text>{compactionResult.summary}</Text>
            </Box>
          </Box>
        )}

        {/* Tool Summaries */}
        <Box flexDirection="column">
          {compactionResult.toolSummaries.map((tool, index) => (
            <Box key={index} marginBottom={0}>
              <Text color="gray">  ⎿  </Text>
              <Text color={tool.success ? "green" : "red"}>
                {tool.summary}
                {tool.executionTime && ` (${tool.executionTime}ms)`}
              </Text>
            </Box>
          ))}
        </Box>

        {/* Statistics (only when expanded) */}
        {expanded && (
          <Box flexDirection="column" marginTop={2} borderTop={true} paddingTop={1}>
            <Text color="gray">
              📊 Compacted {compactionResult.messagesCompacted} messages, saved {formatTokenReduction()}
            </Text>
            <Text color="gray" dimColor>
              Timestamp: {compactionResult.timestamp.toLocaleString()}
            </Text>
          </Box>
        )}
      </Box>

      {/* Instructions */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Press Ctrl+R to {expanded ? 'collapse' : 'expand'} full summary
        </Text>
      </Box>
    </Box>
  );
};

export default CompactionSummaryRenderer;