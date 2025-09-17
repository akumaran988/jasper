import React from 'react';
import { Box, Text } from 'ink';

interface InputHandlerProps {
  input: string;
  onInputChange: (input: string) => void;
  cursorPosition?: number;
  pasteBlocks?: Array<{start: number, end: number, content: string}>;
}

const InputHandler: React.FC<InputHandlerProps> = ({ 
  input, 
  cursorPosition = 0, 
  pasteBlocks = [] 
}) => {
  const maxVisibleLines = 10;
  
  // Check if we have large pasted content to show in compact format
  const hasLargePasteBlocks = pasteBlocks.some(block => block.content.length > 1000);
  
  // Debug logging
  React.useEffect(() => {
    if (pasteBlocks.length > 0) {
      // Only log using logger, not console
      import('../utils/logger.js').then(({ getLogger }) => {
        const logger = getLogger();
        logger.debug('InputHandler: pasteBlocks detected', { 
          blockCount: pasteBlocks.length, 
          hasLargePasteBlocks,
          blocks: pasteBlocks.map(b => ({ start: b.start, end: b.end, length: b.content.length }))
        });
      });
    }
  }, [pasteBlocks, hasLargePasteBlocks]);
  
  // Create display content with paste indicators replacing pasted portions
  const createDisplayContent = () => {
    if (pasteBlocks.length === 0) {
      return input; // No paste blocks, show original content
    }
    
    let displayContent = input;
    
    // Sort paste blocks by start position (reverse order to maintain positions)
    const sortedBlocks = [...pasteBlocks].sort((a, b) => b.start - a.start);
    
    // Replace each large paste block with its indicator
    sortedBlocks.forEach((block) => {
      // Only show compact display for blocks >1000 chars
      if (block.content.length > 1000) {
        const blockLines = block.content.split(/\r\n|\r|\n/);
        const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
        
        const before = displayContent.slice(0, block.start);
        const after = displayContent.slice(block.end);
        displayContent = before + indicator + after;
      }
    });
    
    return displayContent;
  };
  
  const displayContent = createDisplayContent();
  let displayLines: string[];
  
  displayLines = displayContent.split(/\r\n|\r|\n/);
  
  // Calculate which lines to show with smart scrolling based on cursor position
  const displayTotalLines = displayLines.length;
  
  // Calculate proper cursor position accounting for paste block compaction
  const getDisplayCursorPosition = () => {
    if (pasteBlocks.length === 0) {
      return cursorPosition;
    }
    
    let adjustedPos = cursorPosition;
    const sortedBlocks = [...pasteBlocks].sort((a, b) => a.start - b.start);
    
    for (const block of sortedBlocks) {
      if (block.content.length > 1000) {
        const blockLines = block.content.split(/\r\n|\r|\n/);
        const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
        const originalLength = block.end - block.start;
        const newLength = indicator.length;
        const adjustment = newLength - originalLength;
        
        if (cursorPosition >= block.end) {
          // Cursor is after this block - apply the adjustment
          adjustedPos += adjustment;
        } else if (cursorPosition >= block.start) {
          // Cursor is within this block - position it at the end of the indicator
          // This ensures when you type after a paste block, cursor appears after the indicator
          adjustedPos = block.start + newLength;
          break;
        }
      }
    }
    
    return adjustedPos;
  };
  
  const displayCursorPos = getDisplayCursorPosition();
  let cursorLine = 0;
  let charCount = 0;
  
  for (let i = 0; i < displayLines.length; i++) {
    const lineEndPos = charCount + displayLines[i].length;
    if (displayCursorPos <= lineEndPos) {
      cursorLine = i;
      break;
    }
    charCount += displayLines[i].length + 1; // +1 for newline
  }
  
  // Calculate visible lines with cursor-based scrolling
  let startLine: number;
  if (displayTotalLines <= maxVisibleLines) {
    // Show all lines if we have fewer than max
    startLine = 0;
  } else if (cursorLine < maxVisibleLines - 1) {
    // Show from beginning if cursor is near the top
    startLine = 0;
  } else {
    // Center cursor in visible area or show from cursor - (maxVisible - 1)
    startLine = Math.min(cursorLine - Math.floor(maxVisibleLines / 2), displayTotalLines - maxVisibleLines);
    startLine = Math.max(0, startLine);
  }
  
  const visibleLines = displayLines.slice(startLine, startLine + maxVisibleLines);
  
  // Helper to render text with paste indicators in blue
  const renderTextWithPasteIndicators = (text: string) => {
    const parts = text.split(/(\[Pasted [^\]]+\])/);
    return parts.map((part, index) => {
      if (part.match(/\[Pasted [^\]]+\]/)) {
        return <Text key={index} color="blue">{part}</Text>;
      }
      return <Text key={index} color="white">{part}</Text>;
    });
  };
  
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Input box with border */}
      <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
        {displayContent ? (
          visibleLines.map((line, index) => {
            const actualLineIndex = startLine + index;
            const isFirstLine = actualLineIndex === 0;
            const isLastLine = index === visibleLines.length - 1;
            
            // Calculate cursor position for this line in display coordinates
            let lineStart = 0;
            for (let i = 0; i < actualLineIndex; i++) {
              lineStart += displayLines[i].length + 1; // +1 for newline character
            }
            const lineEnd = lineStart + line.length;
            
            const showCursorOnThisLine = displayCursorPos >= lineStart && displayCursorPos <= lineEnd;
            const cursorPosInLine = showCursorOnThisLine ? displayCursorPos - lineStart : -1;
            
            return (
              <Box key={actualLineIndex} flexDirection="row" minHeight={1}>
                <Text color="cyan">
                  {isFirstLine ? '> ' : '  '}
                </Text>
                <Text>
                  {showCursorOnThisLine ? (
                    <>
                      {cursorPosInLine > 0 && renderTextWithPasteIndicators(line.slice(0, cursorPosInLine))}
                      <Text backgroundColor="white" color="black">
                        {cursorPosInLine < line.length ? line[cursorPosInLine] : ' '}
                      </Text>
                      {cursorPosInLine < line.length && renderTextWithPasteIndicators(line.slice(cursorPosInLine + 1))}
                    </>
                  ) : (
                    renderTextWithPasteIndicators(line || (isLastLine ? ' ' : ''))
                  )}
                  {!showCursorOnThisLine && isLastLine && displayCursorPos >= displayContent.length && (
                    <Text backgroundColor="white" color="black"> </Text>
                  )}
                </Text>
              </Box>
            );
          })
        ) : (
          <Box minHeight={1} flexDirection="row">
            <Text color="cyan">{'> '}</Text>
            <Text backgroundColor="white" color="black"> </Text>
          </Box>
        )}
      </Box>
      
      {/* Scroll indicator - only show if there are hidden lines */}
      {displayTotalLines > maxVisibleLines && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {startLine > 0 ? `${startLine} lines above` : ''} 
            {startLine > 0 && (startLine + maxVisibleLines < displayTotalLines) ? ' • ' : ''}
            {startLine + maxVisibleLines < displayTotalLines ? `${displayTotalLines - startLine - maxVisibleLines} lines below` : ''}
          </Text>
        </Box>
      )}
      
      {/* Input hints */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          • Shift+Enter - new line • Ctrl+X - clear screen
        </Text>
      </Box>
    </Box>
  );
};

export default InputHandler;