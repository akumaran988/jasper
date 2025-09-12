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
  const borderWidth = Math.max(20, Math.min(terminalWidth - 4, terminalWidth * 0.95)); // Responsive to terminal width
  const borderLine = '─'.repeat(Math.floor(borderWidth));
  
  
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
  
  // Disable smart scrolling - just show all content
  const displayTotalLines = displayLines.length;
  const displayCursorPos = cursorPosition;
  const startLine = 0;
  const visibleLines = displayLines; // Show all lines, no truncation
  
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
              <Box key={actualLineIndex} flexDirection="row">
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
          <Box flexDirection="row">
            <Text color="white" bold>{'> '}</Text>
            <Text backgroundColor="white" color="black"> </Text>
          </Box>
        )}
      </Box>
      
      
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