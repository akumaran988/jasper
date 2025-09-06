import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ConversationContext } from '../types/index.js';
import MessageRenderer from './renderer.js';
import InputHandler from './input.js';

interface TerminalProps {
  context: ConversationContext;
  onMessage: (message: string) => Promise<void>;
  isProcessing: boolean;
  pendingPermission?: {
    toolCall: any;
    resolve: (approved: boolean) => void;
  } | null;
  onPermissionResponse?: (approved: boolean) => void;
}

const Terminal: React.FC<TerminalProps> = ({ 
  context, 
  onMessage, 
  isProcessing, 
  pendingPermission, 
  onPermissionResponse 
}) => {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [displayCursorPosition, setDisplayCursorPosition] = useState(0); // Track cursor in display coordinates
  const [isPastedContent, setIsPastedContent] = useState(false);
  const [pasteBlocks, setPasteBlocks] = useState<Array<{start: number, end: number, content: string}>>([]);
  const [animationFrame, setAnimationFrame] = useState(0);
  const [lastPasteTime, setLastPasteTime] = useState(0);

  // Animation for processing indicator
  useEffect(() => {
    if (!isProcessing) return;
    
    const interval = setInterval(() => {
      setAnimationFrame(frame => (frame + 1) % 60); // 60 frame cycle
    }, 100); // Update every 100ms
    
    return () => clearInterval(interval);
  }, [isProcessing]);

  useInput((inputChar: string, key: any) => {
    if (key.ctrl && inputChar === 'c') {
      exit();
      return;
    }

    // Handle permission responses
    if (pendingPermission) {
      if (inputChar === 'y' || inputChar === 'Y') {
        onPermissionResponse?.(true);
        return;
      }
      if (inputChar === 'n' || inputChar === 'N') {
        onPermissionResponse?.(false);
        return;
      }
      // Ignore all other keys during permission prompt
      return;
    }

    if (key.return) {
      
      if (key.shift && !pendingPermission) {
        // Shift+Enter for new line (allow even during processing)
        const currentPos = cursorPosition;
        setInput(prev => {
          const newInput = prev.slice(0, currentPos) + '\n' + prev.slice(currentPos);
          return newInput;
        });
        setCursorPosition(currentPos + 1); // Move cursor after the newline
        
        // Update paste blocks positions after insertion
        setPasteBlocks(prev => prev.map(block => ({
          ...block,
          start: block.start > currentPos ? block.start + 1 : block.start,
          end: block.end > currentPos ? block.end + 1 : block.end
        })));
        
        return;
      } else if (!isProcessing && !pendingPermission && !key.shift) {
        // Don't auto-submit if we just pasted content recently
        const recentPaste = lastPasteTime && (Date.now() - lastPasteTime) < 1000;
        if (recentPaste) {
          return;
        }
        
        // Regular Enter to submit
        handleSubmit();
        return;
      }
    }

    // Handle cursor movement - work directly with display coordinates
    if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
      // Create display content
      const createDisplayContent = () => {
        if (pasteBlocks.length === 0) {
          return input;
        }
        
        let displayContent = input;
        const sortedBlocks = [...pasteBlocks].sort((a, b) => b.start - a.start);
        
        sortedBlocks.forEach((block) => {
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
      
      if (key.leftArrow) {
        // Check if we're at the end of a paste block indicator
        const sortedBlocks = [...pasteBlocks].sort((a, b) => a.start - b.start);
        let currentDisplayPos = 0;
        let foundJumpTarget = false;
        
        for (const block of sortedBlocks) {
          // Calculate display positions for this block
          const blockLines = block.content.split(/\r\n|\r|\n/);
          const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
          
          // Add characters before this block
          const charsBeforeBlock = block.start - currentDisplayPos;
          currentDisplayPos += charsBeforeBlock;
          
          const blockStartDisplayPos = currentDisplayPos;
          const blockEndDisplayPos = currentDisplayPos + indicator.length;
          
          // If we're at the end of this paste indicator, jump to start of actual content
          if (displayCursorPosition === blockEndDisplayPos) {
            setCursorPosition(block.start);
            setDisplayCursorPosition(blockStartDisplayPos);
            foundJumpTarget = true;
            break;
          }
          
          currentDisplayPos = blockEndDisplayPos;
        }
        
        if (!foundJumpTarget) {
          const newDisplayPos = Math.max(0, displayCursorPosition - 1);
          setDisplayCursorPosition(newDisplayPos);
          
          // Convert back to raw position for operations that need it
          let rawPos = newDisplayPos;
          let currentDispPos = 0;
          
          for (const block of sortedBlocks) {
            const blockLines = block.content.split(/\r\n|\r|\n/);
            const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
            
            if (newDisplayPos >= currentDispPos && newDisplayPos < currentDispPos + indicator.length) {
              // Position is within a paste block indicator
              rawPos = block.start;
              break;
            } else if (newDisplayPos >= currentDispPos + indicator.length) {
              // Adjust for this paste block
              const adjustment = (block.end - block.start) - indicator.length;
              rawPos += adjustment;
              currentDispPos += indicator.length;
            } else {
              break;
            }
          }
          
          setCursorPosition(Math.max(0, rawPos));
        }
        return;
      }
      
      if (key.rightArrow) {
        // Check if we're at the start of a paste block indicator
        const sortedBlocks = [...pasteBlocks].sort((a, b) => a.start - b.start);
        let currentDisplayPos = 0;
        let foundJumpTarget = false;
        
        for (const block of sortedBlocks) {
          // Calculate display positions for this block
          const blockLines = block.content.split(/\r\n|\r|\n/);
          const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
          
          // Add characters before this block
          const charsBeforeBlock = block.start - currentDisplayPos;
          currentDisplayPos += charsBeforeBlock;
          
          const blockStartDisplayPos = currentDisplayPos;
          const blockEndDisplayPos = currentDisplayPos + indicator.length;
          
          // If we're at the start of this paste indicator, jump to end of actual content
          if (displayCursorPosition === blockStartDisplayPos) {
            setCursorPosition(block.end);
            setDisplayCursorPosition(blockEndDisplayPos);
            foundJumpTarget = true;
            break;
          }
          
          currentDisplayPos = blockEndDisplayPos;
        }
        
        if (!foundJumpTarget) {
          const newDisplayPos = Math.min(displayContent.length, displayCursorPosition + 1);
          setDisplayCursorPosition(newDisplayPos);
          
          // Convert back to raw position for operations that need it
          let rawPos = newDisplayPos;
          let currentDispPos = 0;
          
          for (const block of sortedBlocks) {
            const blockLines = block.content.split(/\r\n|\r|\n/);
            const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
            
            if (newDisplayPos >= currentDispPos && newDisplayPos < currentDispPos + indicator.length) {
              // Position is within a paste block indicator
              rawPos = block.start;
              break;
            } else if (newDisplayPos >= currentDispPos + indicator.length) {
              // Adjust for this paste block
              const adjustment = (block.end - block.start) - indicator.length;
              rawPos += adjustment;
              currentDispPos += indicator.length;
            } else {
              break;
            }
          }
          
          setCursorPosition(Math.min(input.length, rawPos));
        }
        return;
      }
      
      if (key.upArrow) {
        // Find current line and column in display content
        let charCount = 0;
        let currentLine = 0;
        let currentColumn = 0;
        
        for (let i = 0; i < displayLines.length; i++) {
          const lineEndPos = charCount + displayLines[i].length;
          if (displayCursorPosition <= lineEndPos) {
            currentLine = i;
            currentColumn = displayCursorPosition - charCount;
            break;
          }
          charCount += displayLines[i].length + 1; // +1 for newline
        }
        
        if (currentLine > 0) {
          const targetLine = currentLine - 1;
          const targetColumn = Math.min(currentColumn, displayLines[targetLine].length);
          let newDisplayPos = 0;
          
          for (let i = 0; i < targetLine; i++) {
            newDisplayPos += displayLines[i].length + 1;
          }
          newDisplayPos += targetColumn;
          
          setDisplayCursorPosition(newDisplayPos);
        }
        return;
      }
      
      if (key.downArrow) {
        // Find current line and column in display content
        let charCount = 0;
        let currentLine = 0;
        let currentColumn = 0;
        
        for (let i = 0; i < displayLines.length; i++) {
          const lineEndPos = charCount + displayLines[i].length;
          if (displayCursorPosition <= lineEndPos) {
            currentLine = i;
            currentColumn = displayCursorPosition - charCount;
            break;
          }
          charCount += displayLines[i].length + 1; // +1 for newline
        }
        
        if (currentLine < displayLines.length - 1) {
          const targetLine = currentLine + 1;
          const targetColumn = Math.min(currentColumn, displayLines[targetLine].length);
          let newDisplayPos = 0;
          
          for (let i = 0; i < targetLine; i++) {
            newDisplayPos += displayLines[i].length + 1;
          }
          newDisplayPos += targetColumn;
          
          setDisplayCursorPosition(newDisplayPos);
        }
        return;
      }
    }

    if (key.backspace || key.delete) {
      if (!pendingPermission && cursorPosition > 0) {
        // Check if cursor is at the end of a paste block
        const pasteBlockAtCursor = pasteBlocks.find(block => cursorPosition === block.end);
        
        if (pasteBlockAtCursor) {
          // Delete entire paste block
          setInput(prev => {
            const newInput = prev.slice(0, pasteBlockAtCursor.start) + prev.slice(pasteBlockAtCursor.end);
            return newInput;
          });
          setCursorPosition(pasteBlockAtCursor.start);
          setPasteBlocks(prev => prev.filter(block => block !== pasteBlockAtCursor));
          setIsPastedContent(pasteBlocks.length > 1);
        } else {
          // Normal backspace
          setInput(prev => {
            const newInput = prev.slice(0, cursorPosition - 1) + prev.slice(cursorPosition);
            return newInput;
          });
          setCursorPosition(prev => Math.max(0, prev - 1));
          
          // Update paste blocks positions after deletion
          setPasteBlocks(prev => prev.map(block => ({
            ...block,
            start: block.start > cursorPosition ? block.start - 1 : block.start,
            end: block.end > cursorPosition ? block.end - 1 : block.end
          })).filter(block => block.start < block.end));
          
          setIsPastedContent(pasteBlocks.length > 0);
        }
      }
      return;
    }

    if (!key.ctrl && !key.meta && !pendingPermission && inputChar.length >= 1) {
      
      const currentPos = cursorPosition;
      
      // For paste operations, don't add trailing newlines that would trigger auto-submit
      let processedChar = inputChar;
      // Only detect actual paste operations - large content or structured data
      // Don't treat small multi-character inputs (like \\r from Shift+Enter) as paste
      const isPaste = (inputChar.length > 20) ||  // Large input is definitely paste
                     (inputChar.length > 5 && inputChar.includes('{') && inputChar.includes('"')) || // JSON
                     (inputChar.length > 5 && inputChar.includes('[') && inputChar.includes('"')); // Array
      
      if (isPaste && (inputChar.endsWith('\n') || inputChar.endsWith('\r'))) {
        // Remove trailing newlines/carriage returns from paste to prevent auto-submit
        processedChar = inputChar.replace(/[\n\r]+$/, '');
      }
      
      setInput(prev => {
        const newInput = prev.slice(0, currentPos) + processedChar + prev.slice(currentPos);
        return newInput;
      });
      setCursorPosition(currentPos + processedChar.length);
      
      // Update display cursor position to match
      const newDisplayPos = currentPos + processedChar.length;
      // Adjust for any paste blocks that come before this position
      let adjustment = 0;
      const sortedBlocks = [...pasteBlocks].sort((a, b) => a.start - b.start);
      for (const block of sortedBlocks) {
        if (newDisplayPos > block.start) {
          const blockLines = block.content.split(/\r\n|\r|\n/);
          const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
          adjustment += indicator.length - (block.end - block.start);
        }
      }
      setDisplayCursorPosition(newDisplayPos + adjustment);
                     
      // Check if this input should be merged with a recent paste block (even if not detected as paste itself)
      const shouldMergeWithRecentPaste = () => {
        if (pasteBlocks.length === 0) return false;
        const lastBlock = pasteBlocks[pasteBlocks.length - 1];
        return lastBlock && 
               lastBlock.end === currentPos &&
               (Date.now() - lastPasteTime) < 1000; // Within 1 second of last paste
      };

      if (isPaste || shouldMergeWithRecentPaste()) {
        // Mark the time of paste to prevent auto-submit from newlines
        if (isPaste) {
          setLastPasteTime(Date.now());
        }
        
        // Check if this should be merged with the last paste block
        setPasteBlocks(prev => {
          const lastBlock = prev[prev.length - 1];
          const shouldMerge = lastBlock && 
                             lastBlock.end === currentPos &&
                             (Date.now() - lastPasteTime) < 1000; // Within 1 second
          
          if (shouldMerge) {
            // Merge with the last paste block
            const updatedBlocks = [...prev];
            const newEnd = currentPos + processedChar.length;
            updatedBlocks[updatedBlocks.length - 1] = {
              ...lastBlock,
              end: newEnd,
              content: lastBlock.content + inputChar // Use original content
            };
            return updatedBlocks;
          } else {
            // Create new paste block - use original inputChar for content tracking
            const newPasteBlock = {
              start: currentPos,
              end: currentPos + processedChar.length,
              content: inputChar // Store original content, not processed
            };
            return [...prev, newPasteBlock];
          }
        });
        
        setIsPastedContent(true);
      }
    }
  });

  const handleSubmit = useCallback(async () => {
    const messageToSend = input.trim();
    
    if (messageToSend && !isProcessing) {
      setInput('');
      setCursorPosition(0);
      setIsPastedContent(false);
      setPasteBlocks([]);
      await onMessage(messageToSend);
    }
  }, [input, isProcessing, onMessage]);

  return (
    <Box flexDirection="column" minHeight={3}>
      {/* Header - Claude Code style */}
      {context.messages.length === 0 && (
        <Box flexDirection="column" marginBottom={2}>
          <Text color="white" bold>
            ✻ Welcome to Jasper!
          </Text>
          <Text></Text>
          <Text color="gray">
            /help for help, /status for your current setup
          </Text>
          <Text></Text>
          <Text color="gray">
            cwd: {process.cwd()}
          </Text>
          <Text></Text>
          <Text color="white" bold>
            Tips for getting started:
          </Text>
          <Text></Text>
          <Text color="gray">
            1. Ask Jasper to create a new app or clone a repository
          </Text>
          <Text color="gray">
            2. Use Jasper to help with file analysis, editing, bash commands and git
          </Text>
          <Text color="gray">
            3. Be as specific as you would with another engineer for the best results
          </Text>
          <Text color="gray">
            4. ✔ Run /terminal-setup to set up terminal integration
          </Text>
          <Text></Text>
        </Box>
      )}

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1}>
        {context.messages.filter(m => m.role !== 'system' || m.content.startsWith('Tool execution results:')).map((message, index) => (
          <MessageRenderer key={index} message={message} messages={context.messages} index={context.messages.findIndex(m => m === message)} />
        ))}
      </Box>

      {/* Permission prompt */}
      {pendingPermission && (
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
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
          <Box>
            <Text color="white">
              Allow this tool to execute? <Text color="green" bold>(Y)</Text>es / <Text color="red" bold>(N)</Text>o
            </Text>
          </Box>
        </Box>
      )}

      {/* Animated Processing indicator */}
      {isProcessing && !pendingPermission && (
        <AnimatedProcessingIndicator 
          frame={animationFrame} 
          iteration={context.currentIteration}
        />
      )}

      {/* Input - always show unless there's a permission prompt */}
      {!pendingPermission && (
        <InputHandler 
          input={input} 
          onInputChange={setInput} 
          isPasted={isPastedContent} 
          cursorPosition={displayCursorPosition}
          pasteBlocks={pasteBlocks}
        />
      )}

      {/* Status bar at bottom */}
      <Box marginTop={1} justifyContent="flex-end">
        <Text color="gray" dimColor>
          {pendingPermission 
            ? '⏵⏵ awaiting permission (Y/N to respond)'
            : isProcessing 
            ? `⏵⏵ processing (${context.currentIteration}/${context.maxIterations})` 
            : '⏵⏵ ready (ctrl+c to exit)'
          }
        </Text>
      </Box>
    </Box>
  );
};

const AnimatedProcessingIndicator: React.FC<{
  frame: number;
  iteration: number;
}> = ({ frame, iteration }) => {
  const quirkyWords = [
    'Pondering', 'Brewing', 'Conjuring', 'Weaving', 'Crafting', 
    'Summoning', 'Manifesting', 'Orchestrating', 'Channeling', 'Synthesizing',
    'Harmonizing', 'Crystallizing', 'Architecting', 'Blueprinting', 'Materializing'
  ];
  
  const colors = ['cyan', 'magenta', 'yellow', 'green', 'blue', 'red'];
  
  // Choose word based on iteration to add variety
  const currentWord = quirkyWords[iteration % quirkyWords.length];
  
  // Create square spinner effect
  const spinnerChars = ['◐', '◓', '◑', '◒'];
  const currentSpinner = spinnerChars[Math.floor(frame / 8) % spinnerChars.length];
  
  const renderSpinner = () => {
    return currentSpinner;
  };
  
  // Cycle through colors
  const currentColor = colors[Math.floor(frame / 10) % colors.length];
  
  return (
    <Box marginTop={1}>
      <Text color={currentColor as any}>
        {renderSpinner()} {currentWord}...
      </Text>
      <Text color="gray" dimColor>
        {' '}(esc to interrupt)
      </Text>
    </Box>
  );
};

export default Terminal;