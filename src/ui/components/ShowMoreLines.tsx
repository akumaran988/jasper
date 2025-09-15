import { Box, Text } from 'ink';
import { useOverflowState } from '../../contexts/OverflowContext.js';
import { useStreamingContext } from '../../contexts/StreamingContext.js';
import { StreamingState } from '../../contexts/StreamingContext.js';

interface ShowMoreLinesProps {
  constrainHeight: boolean;
}

export const ShowMoreLines = ({ constrainHeight }: ShowMoreLinesProps) => {
  const overflowState = useOverflowState();
  const streamingContext = useStreamingContext();

  if (
    overflowState === undefined ||
    overflowState.overflowingIds.size === 0 ||
    !constrainHeight ||
    !(
      streamingContext.state === StreamingState.Idle ||
      streamingContext.state === StreamingState.WaitingForConfirmation
    )
  ) {
    return null;
  }

  return (
    <Box>
      <Text color="gray" wrap="truncate">
        Press ctrl-s to show more lines
      </Text>
    </Box>
  );
};