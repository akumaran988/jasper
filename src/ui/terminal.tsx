import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { ConversationContext } from '../types/index.js';
import MessageRenderer from './renderer.js';
import InputHandler from './input.js';
import { useAutoScroll } from '../hooks/useAutoScroll.js';
import { getLogger } from '../utils/logger.js';

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
  const { stdout } = useStdout();
  const logger = useMemo(() => getLogger(), []);
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [displayCursorPosition, setDisplayCursorPosition] = useState(0); // Track cursor in display coordinates
  const [isPastedContent, setIsPastedContent] = useState(false);
  const [pasteBlocks, setPasteBlocks] = useState<Array<{start: number, end: number, content: string}>>([]);
  const [animationFrame, setAnimationFrame] = useState(0);
  const [lastPasteTime, setLastPasteTime] = useState(0);
  
  // Auto-scroll functionality
  const [scrollState, scrollControls] = useAutoScroll(
    context.messages.length,
    isProcessing,
    !!pendingPermission,
    {
      enabled: true,
      scrollToBottomOnUpdate: true,
      disableOnManualScroll: true,
      debugLogging: true
    }
  );

  // Track scroll position for manual scroll detection
  const [userScrollOffset, setUserScrollOffset] = useState(0);
  const messagesRef = useRef<any>(null);
  
  // Track expanded tool results by message index and result index
  const [expandedToolResults, setExpandedToolResults] = useState<Set<string>>(new Set());
  
  // Track which tool result is currently focused/selected
  const [focusedToolResult, setFocusedToolResult] = useState<string | null>(null);
  
  // Auto-focus the most recent tool result when new ones appear
  useEffect(() => {
    const systemMessages = context.messages.filter(m => 
      m.role === 'system' && m.content.startsWith('Tool execution results:')
    );
    
    if (systemMessages.length > 0) {
      const lastSystemIndex = context.messages.findIndex(m => m === systemMessages[systemMessages.length - 1]);
      const mostRecentKey = `${lastSystemIndex}-0`;
      
      // Only auto-focus if no tool result is currently focused, or if this is a new one
      if (!focusedToolResult || !focusedToolResult.startsWith(lastSystemIndex.toString())) {
        setFocusedToolResult(mostRecentKey);
        logger.debug('Auto-focused most recent tool result:', mostRecentKey);
      }
    }
  }, [context.messages.length, focusedToolResult, logger]);
  
  // Add logging for scroll offset changes
  useEffect(() => {
    logger.warn('📜 USER SCROLL OFFSET CHANGED', {
      userScrollOffset,
      isAutoScrollEnabled: scrollState.isAutoScrollEnabled,
      isProcessing,
      hasPendingPermission: !!pendingPermission,
      messageCount: context.messages.length
    });
  }, [userScrollOffset, scrollState.isAutoScrollEnabled, isProcessing, pendingPermission, context.messages.length, logger]);

  // Animation for processing indicator - DISABLED to fix mouse scroll issues
  // The 100ms re-renders were interfering with mouse scroll position
  // useEffect(() => {
  //   if (!isProcessing) return;
  //   const interval = setInterval(() => {
  //     setAnimationFrame(frame => (frame + 1) % 60);
  //   }, 100);
  //   return () => clearInterval(interval);
  // }, [isProcessing]);

  // DISABLED: Auto-scroll effects for processing - this was causing mouse scroll issues
  // useEffect(() => {
  //   if (isProcessing && scrollState.isAutoScrollEnabled) {
  //     scrollControls.scrollToBottom();
  //   }
  // }, [isProcessing, scrollState.isAutoScrollEnabled]);

  // DISABLED: Auto-scroll for permission prompts - this was also causing mouse scroll issues
  // useEffect(() => {
  //   if (pendingPermission && scrollState.isAutoScrollEnabled) {
  //     scrollControls.scrollToBottom();
  //   }
  // }, [pendingPermission, scrollState.isAutoScrollEnabled]);

  useInput((inputChar: string, key: any) => {
    if (key.ctrl && inputChar === 'c') {
      exit();
      return;
    }

    // Handle scroll controls
    if (key.ctrl && inputChar === 's') {
      // Ctrl+S to toggle auto-scroll
      logger.info('User toggling auto-scroll', {
        currentlyEnabled: scrollState.isAutoScrollEnabled,
        willBeEnabled: !scrollState.isAutoScrollEnabled,
        userScrollOffset
      });
      scrollControls.toggleAutoScroll();
      return;
    }

    // Helper function to get all tool result keys
    const getAllToolResultKeys = () => {
      const toolResultKeys: string[] = [];
      context.messages.forEach((msg, msgIndex) => {
        if (msg.role === 'system' && msg.content.startsWith('Tool execution results:')) {
          const results = msg.content.replace('Tool execution results:\n', '').split('\n\n');
          results.forEach((_, resultIndex) => {
            toolResultKeys.push(`${msgIndex}-${resultIndex}`);
          });
        }
      });
      return toolResultKeys;
    };

    // Handle Up/Down arrow navigation for tool results (when not typing)
    if ((key.upArrow || key.downArrow) && !pendingPermission) {
      const toolResultKeys = getAllToolResultKeys();
      
      if (toolResultKeys.length > 0) {
        const currentIndex = focusedToolResult ? toolResultKeys.indexOf(focusedToolResult) : -1;
        
        let nextIndex;
        if (key.upArrow) {
          nextIndex = currentIndex <= 0 ? toolResultKeys.length - 1 : currentIndex - 1;
        } else {
          nextIndex = currentIndex >= toolResultKeys.length - 1 ? 0 : currentIndex + 1;
        }
        
        const newFocused = toolResultKeys[nextIndex];
        setFocusedToolResult(newFocused);
        logger.info('Navigated to tool result:', newFocused);
      }
      return;
    }

    // Handle Ctrl+Up/Down for jumping to first/last tool result
    if (key.ctrl && (key.upArrow || key.downArrow)) {
      const toolResultKeys = getAllToolResultKeys();
      
      if (toolResultKeys.length > 0) {
        const newFocused = key.upArrow ? toolResultKeys[0] : toolResultKeys[toolResultKeys.length - 1];
        setFocusedToolResult(newFocused);
        logger.info('Jumped to tool result:', newFocused, key.upArrow ? '(first)' : '(last)');
      }
      return;
    }

    // Handle number keys (1-9) to quickly focus tool results
    if (!pendingPermission && !key.ctrl && !key.meta && inputChar >= '1' && inputChar <= '9') {
      const toolResultKeys = getAllToolResultKeys();
      const index = parseInt(inputChar) - 1;
      
      if (index < toolResultKeys.length) {
        const targetKey = toolResultKeys[index];
        setFocusedToolResult(targetKey);
        logger.info('Quick-focused tool result:', targetKey, `(${inputChar})`);
      }
      return;
    }

    // Handle tool result expansion (Ctrl+E)
    if (key.ctrl && inputChar === 'e') {
      // Use focused tool result if available, otherwise use the most recent one
      let targetResultKey = focusedToolResult;
      
      if (!targetResultKey) {
        // Find the most recent tool result
        const systemMessages = context.messages.filter(m => 
          m.role === 'system' && m.content.startsWith('Tool execution results:')
        );
        
        if (systemMessages.length > 0) {
          const lastSystemIndex = context.messages.findIndex(m => m === systemMessages[systemMessages.length - 1]);
          targetResultKey = `${lastSystemIndex}-0`; // First result in the last system message
        }
      }
      
      if (targetResultKey) {
        setExpandedToolResults(prev => {
          const newSet = new Set(prev);
          if (newSet.has(targetResultKey)) {
            newSet.delete(targetResultKey);
            logger.info('Collapsed tool result:', targetResultKey);
          } else {
            newSet.add(targetResultKey);
            logger.info('Expanded tool result:', targetResultKey);
          }
          return newSet;
        });
      }
      return;
    }

    if (key.pageUp || key.pageDown) {
      logger.warn('🔍 PAGE KEY DETECTED!', { 
        key: key.pageUp ? 'PAGE_UP' : 'PAGE_DOWN',
        currentOffset: userScrollOffset,
        isAutoScrollEnabled: scrollState.isAutoScrollEnabled
      });
      
      // Manual scroll detection - disable auto-scroll
      if (scrollState.isAutoScrollEnabled) {
        scrollControls.disableAutoScroll();
        logger.warn('🚫 Auto-scroll disabled due to manual scroll');
      }
      
      const terminalHeight = stdout?.rows || 24;
      const scrollAmount = Math.max(1, terminalHeight - 3); // Account for input area
      
      if (key.pageUp) {
        const newOffset = Math.max(0, userScrollOffset - scrollAmount);
        setUserScrollOffset(newOffset);
        logger.warn('⬆️ Manual scroll up executed', { 
          previousOffset: userScrollOffset,
          newOffset,
          scrollAmount,
          totalMessages: context.messages.length
        });
      } else if (key.pageDown) {
        const maxMessages = context.messages.length;
        const newOffset = Math.max(0, userScrollOffset + scrollAmount);
        setUserScrollOffset(newOffset);
        logger.warn('⬇️ Manual scroll down executed', { 
          previousOffset: userScrollOffset,
          newOffset,
          scrollAmount,
          totalMessages: maxMessages
        });
        
        // If scrolled to bottom, re-enable auto-scroll
        if (newOffset >= maxMessages - scrollAmount) {
          scrollControls.enableAutoScroll();
          logger.info('Re-enabled auto-scroll after reaching bottom');
        }
      }
      return;
    }

    // Home/End keys for quick navigation
    if (key.ctrl && (inputChar === 'home' || key.home)) {
      setUserScrollOffset(0);
      scrollControls.disableAutoScroll();
      logger.info('User pressed Ctrl+Home - scroll to top', {
        previousOffset: userScrollOffset,
        autoScrollPreviouslyEnabled: scrollState.isAutoScrollEnabled
      });
      return;
    }
    
    if (key.ctrl && (inputChar === 'end' || key.end)) {
      // This is the ONLY place where we should reset userScrollOffset to 0
      setUserScrollOffset(0);
      scrollControls.enableAutoScroll();
      scrollControls.scrollToBottom();
      logger.info('User pressed Ctrl+End - scroll to bottom and reset offset', {
        previousOffset: userScrollOffset,
        autoScrollPreviouslyEnabled: scrollState.isAutoScrollEnabled
      });
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
      <Box ref={messagesRef} flexDirection="column" flexGrow={1} justifyContent="flex-end">
        {(() => {
          const filteredMessages = context.messages.filter(m => 
            m.role !== 'system' || m.content.startsWith('Tool execution results:')
          );
          
          // Handle scrolling by limiting visible messages
          const terminalHeight = stdout?.rows || 24;
          const availableHeight = terminalHeight - 8; // Account for header, input, status
          
          // Reduced logging to prevent spam during render loops
          if (filteredMessages.length % 5 === 0) { // Only log every 5th message count
            logger.debug('Height calculation', {
              terminalHeight,
              availableHeight,
              totalMessages: filteredMessages.length
            });
          }
          
          let visibleMessages = filteredMessages;
          
          // If auto-scroll is disabled and user has scrolled, show from offset
          if (!scrollState.isAutoScrollEnabled && userScrollOffset > 0) {
            const startIndex = Math.max(0, userScrollOffset);
            const endIndex = Math.min(filteredMessages.length, startIndex + availableHeight);
            visibleMessages = filteredMessages.slice(startIndex, endIndex);
            
            logger.debug('Showing messages with manual scroll offset', {
              totalMessages: filteredMessages.length,
              startIndex,
              endIndex,
              userScrollOffset,
              availableHeight,
              autoScrollEnabled: scrollState.isAutoScrollEnabled
            });
          } else {
            // Auto-scroll enabled - show latest messages
            const startIndex = Math.max(0, filteredMessages.length - availableHeight);
            visibleMessages = filteredMessages.slice(startIndex);
            
            // Only log when startIndex actually changes
            if (startIndex !== 0 || filteredMessages.length % 10 === 0) {
              logger.debug('Auto-scroll calculation', {
                totalMessages: filteredMessages.length,
                startIndex,
                showingAllMessages: startIndex === 0
              });
            }
            
            // DON'T reset user scroll offset here - it causes render loops and jumps to top
            // The userScrollOffset should only be reset by explicit user actions (Ctrl+End)
            if (userScrollOffset > 0) {
              logger.debug('Auto-scroll active but user has scroll offset - keeping offset for smooth transition', {
                userScrollOffset,
                totalMessages: filteredMessages.length,
                startIndex,
                autoScrollEnabled: scrollState.isAutoScrollEnabled
              });
            }
            
            if (scrollState.isAutoScrollEnabled && filteredMessages.length > 0) {
              // Reduced logging to prevent spam
              if (filteredMessages.length % 3 === 0) { // Only log every 3rd message count
                logger.debug('Auto-scroll showing latest messages', {
                  totalMessages: filteredMessages.length,
                  visibleCount: visibleMessages.length,
                  showingAll: filteredMessages.length <= availableHeight
                });
              }
            }
          }
          
          return visibleMessages.map((message, index) => {
            const originalIndex = context.messages.findIndex(m => m === message);
            return (
              <MessageRenderer 
                key={`${originalIndex}-${index}`} 
                message={message} 
                messages={context.messages} 
                index={originalIndex}
                expandedToolResults={expandedToolResults}
                focusedToolResult={focusedToolResult}
                onToggleExpansion={(resultKey: string) => {
                  setExpandedToolResults(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(resultKey)) {
                      newSet.delete(resultKey);
                      logger.info('Collapsed tool result:', resultKey);
                    } else {
                      newSet.add(resultKey);
                      logger.info('Expanded tool result:', resultKey);
                    }
                    return newSet;
                  });
                }}
                onFocusToolResult={(resultKey: string) => {
                  setFocusedToolResult(resultKey);
                  logger.info('Focused tool result:', resultKey);
                }}
              />
            );
          });
        })()}
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
      <Box marginTop={1} justifyContent="space-between">
        <Box>
          <Text color="gray" dimColor>
            {!scrollState.isAutoScrollEnabled && (
              <Text color="yellow">📜 Manual scroll </Text>
            )}
            {scrollState.isAutoScrollEnabled && scrollState.isAtBottom && (
              <Text color="green">🔄 Auto-scroll </Text>
            )}
            {focusedToolResult && (
              <Text color="cyan">🎯 Focused: {focusedToolResult} </Text>
            )}
            <Text color="blue">1-9:select ↑↓:navigate Ctrl+↑↓:jump Ctrl+E:expand</Text>
          </Text>
        </Box>
        <Box>
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