import React from 'react';
import { Box, Text, useStdout } from 'ink';

interface InputHandlerProps {
  input: string;
  onInputChange: (input: string) => void;
  isPasted?: boolean;
  cursorPosition?: number;
  pasteBlocks?: Array<{start: number, end: number, content: string}>;
}

const InputHandler: React.FC<InputHandlerProps> = ({ input, isPasted = false, cursorPosition = 0, pasteBlocks = [] }) => {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  const borderWidth = Math.max(40, Math.min(terminalWidth - 4, 120)); // Cap at 120 chars
  const borderLine = '─'.repeat(borderWidth);
  
  const inputLines = input.split(/\r\n|\r|\n/);
  const hasMultipleLines = inputLines.length > 1;
  const maxVisibleLines = 5;
  const totalLines = inputLines.length;
  
  
  // Create display content with paste indicators replacing pasted portions
  const createDisplayContent = () => {
    if (pasteBlocks.length === 0) {
      return input; // No paste blocks, show original content
    }
    
    let displayContent = input;
    
    // Sort paste blocks by start position (reverse order to maintain positions)
    const sortedBlocks = [...pasteBlocks].sort((a, b) => b.start - a.start);
    
    // Replace each paste block with its indicator
    sortedBlocks.forEach((block, index) => {
      const blockLines = block.content.split(/\r\n|\r|\n/);
      const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
      
      const before = displayContent.slice(0, block.start);
      const after = displayContent.slice(block.end);
      displayContent = before + indicator + after;
    });
    
    return displayContent;
  };
  
  const displayContent = createDisplayContent();
  const displayLines = displayContent.split(/\r\n|\r|\n/);
  
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
  
  // Calculate which lines to show with smart scrolling based on cursor position
  const displayTotalLines = displayLines.length;
  
  // We now receive the cursor position directly in display coordinates
  const displayCursorPos = cursorPosition;
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
                <Text color="white" bold>
                  {isFirstLine ? '> ' : '  '}
                </Text>
                <Text>
                  {showCursorOnThisLine ? (
                    <>
                      {renderTextWithPasteIndicators(line.slice(0, cursorPosInLine))}
                      <Text backgroundColor="white" color="black"> </Text>
                      {renderTextWithPasteIndicators(line.slice(cursorPosInLine))}
                    </>
                  ) : (
                    renderTextWithPasteIndicators(line || ' ')
                  )}
                  {isLastLine && !showCursorOnThisLine && displayCursorPos >= displayContent.length && (
                    <Text backgroundColor="white" color="black"> </Text>
                  )}
                </Text>
              </Box>
            );
          })
        ) : (
          /* Show cursor when no content */
          <Box flexDirection="row" minHeight={1}>
            <Text color="white" bold>{'> '}</Text>
            <Text backgroundColor="white" color="black"> </Text>
          </Box>
        )}
      </Box>
      
      {/* Scroll indicator - only show if there are hidden lines */}
      {displayTotalLines > maxVisibleLines && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {startLine > 0 ? `↑ ${startLine} lines above` : ''} 
            {startLine > 0 && (startLine + maxVisibleLines < displayTotalLines) ? ' • ' : ''}
            {startLine + maxVisibleLines < displayTotalLines ? `${displayTotalLines - startLine - maxVisibleLines} lines below ↓` : ''}
          </Text>
        </Box>
      )}
      
      {/* Input hints */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {hasMultipleLines 
            ? `${inputLines.length} lines • ↵ to send • ⇧↵ new line`
            : '↵ to send • ⇧↵ new line'
          }
        </Text>
      </Box>
    </Box>
  );
};

export default InputHandler;