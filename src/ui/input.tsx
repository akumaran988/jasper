import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

interface InputHandlerProps {
  input: string;
  onInputChange: (input: string) => void;
  isPasted?: boolean;
  cursorPosition?: number;
  pasteBlocks?: Array<{start: number, end: number, content: string}>;
}

const InputHandler: React.FC<InputHandlerProps> = ({ 
  input, 
  isPasted = false, 
  cursorPosition = 0, 
  pasteBlocks = [] 
}) => {
  const maxVisibleLines = 10;
  
  // Since we simplified the cursor logic, we can use input directly for now
  const displayContent = input;
  const displayLines = displayContent.split(/\r\n|\r|\n/);
  
  // Calculate which lines to show with smart scrolling based on cursor position
  const displayTotalLines = displayLines.length;
  
  // Use cursor position directly since we simplified the logic
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
  
  const renderTextWithPasteIndicators = (text: string) => {
    // Simplified - just return text for now
    return text;
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
            {startLine > 0 ? `↑ ${startLine} lines above` : ''} 
            {startLine > 0 && (startLine + maxVisibleLines < displayTotalLines) ? ' • ' : ''}
            {startLine + maxVisibleLines < displayTotalLines ? `${displayTotalLines - startLine - maxVisibleLines} lines below ↓` : ''}
          </Text>
        </Box>
      )}
      
      {/* Input hints */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↵ to send • ⇧↵ new line {isPasted && '• Pasted content highlighted'}
        </Text>
      </Box>
    </Box>
  );
};

export default InputHandler;