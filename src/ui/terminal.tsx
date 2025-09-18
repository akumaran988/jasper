import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useInput, useApp, useStdout } from 'ink';
import ansiEscapes from 'ansi-escapes';
import { ConversationContext, PermissionContext, PermissionResponse, PermissionRule, SlashCommand } from '../types/index.js';
import { permissionRegistry } from '../permissions/registry.js';
import { App } from './App.js';

import { useAutoScroll } from '../hooks/useAutoScroll.js';
import { getLogger } from '../utils/logger.js';
import { StreamingProvider, useStreamingContext } from '../contexts/StreamingContext.js';

const TERMINAL_PADDING_X = 8;

interface TerminalProps {
  context: ConversationContext;
  onMessage: (message: string) => Promise<void>;
  isProcessing: boolean;
  isCompacting?: boolean;
  pendingPermission?: PermissionContext | null;
  onPermissionResponse?: (response: PermissionResponse) => void;
  sessionApprovals?: Map<string, PermissionRule>;
  onClearConversation?: () => void;
  onCompactConversation?: () => void;
}

enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation'
}

interface UIState {
  terminalWidth: number;
  terminalHeight: number;
  mainAreaWidth: number;
  availableHeight?: number;
  constrainHeight: boolean;
  streamingState: StreamingState;
  isInputActive: boolean;
  historyRemountKey: number;
}

const TerminalContent: React.FC<TerminalProps> = ({ 
  context, 
  onMessage, 
  isProcessing, 
  isCompacting = false,
  pendingPermission, 
  onPermissionResponse,
  sessionApprovals = new Map(),
  onClearConversation,
  onCompactConversation
}) => {
  const streamingContext = useStreamingContext();
  const { exit } = useApp();
  const logger = useMemo(() => getLogger(), []);
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isPastedContent, setIsPastedContent] = useState(false);
  const [pasteBlocks, setPasteBlocks] = useState<Array<{start: number, end: number, content: string}>>([]);
  const [displayCursorPosition, setDisplayCursorPosition] = useState(0);
  const [lastPasteTime, setLastPasteTime] = useState(0);
  const pasteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [terminalSize, setTerminalSize] = useState({
    columns: (process.stdout.columns || 60) - TERMINAL_PADDING_X,
    rows: process.stdout.rows || 200, // Increased from 20 to 200 for large buffer
  });
  
  const isInitialMount = React.useRef(true);

  useEffect(() => {
    function updateSize() {
      setTerminalSize({
        columns: (process.stdout.columns || 60) - TERMINAL_PADDING_X,
        rows: process.stdout.rows || 200, // Increased from 20 to 200 for large buffer
      });
    }

    process.stdout.on('resize', updateSize);
    return () => {
      process.stdout.off('resize', updateSize);
    };
  }, []);

  // UI State management
  const [constrainHeight, setConstrainHeight] = useState(true);
  const [historyRemountKey, setHistoryRemountKey] = useState(0);
  
  // Refresh static content function
  const { stdout } = useStdout();
  const refreshStatic = useCallback(() => {
    stdout.write(ansiEscapes.clearTerminal); // Clear terminal
    setHistoryRemountKey((prev) => prev + 1);
    logger.debug('Terminal refreshed due to resize', {
      columns: terminalSize.columns,
      rows: terminalSize.rows
    });
  }, [logger, terminalSize, stdout]);
  
  // Terminal refresh on resize
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const handler = setTimeout(() => {
      refreshStatic();
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [terminalSize.columns, refreshStatic]);
  
  const uiState: UIState = useMemo(() => {
    const widthFraction = 0.9;
    const mainAreaWidth = Math.floor(terminalSize.columns * widthFraction);
    const calculatedHeight = Math.max(terminalSize.rows - 10, 10000); // Ensure large buffer, minimum 10k lines
    
    return {
      terminalWidth: terminalSize.columns,
      terminalHeight: terminalSize.rows,
      mainAreaWidth,
      availableHeight: constrainHeight ? calculatedHeight : undefined,
      constrainHeight,
      streamingState: isProcessing ? StreamingState.Responding : 
                     pendingPermission ? StreamingState.WaitingForConfirmation :
                     StreamingState.Idle,
      isInputActive: !pendingPermission && !isProcessing,
      historyRemountKey
    };
  }, [terminalSize, constrainHeight, isProcessing, pendingPermission, historyRemountKey]);

  // Enhanced auto-scroll functionality with streaming support
  const [scrollState, scrollControls] = useAutoScroll(
    context.messages.length + (streamingContext.isStreaming ? 1 : 0), // Account for streaming messages
    isProcessing || streamingContext.isStreaming,
    !!pendingPermission,
    {
      enabled: true,
      scrollToBottomOnUpdate: true,
      disableOnManualScroll: true,
      debugLogging: true,
      constrainHeight: constrainHeight,
      availableHeight: uiState.availableHeight
    }
  );

  // Real-time streaming updates handler - PRESERVE scroll position
  useEffect(() => {
    if (streamingContext.isStreaming && streamingContext.currentMessage) {
      logger.debug('Real-time update received', {
        messageId: streamingContext.currentMessage.id,
        contentLength: streamingContext.currentMessage.content.length,
        updateCount: streamingContext.updateCount,
        autoScrollEnabled: scrollState.isAutoScrollEnabled
      });
      
      // ONLY auto-scroll if user hasn't manually scrolled away from bottom
      // This preserves manual scroll position during streaming
      if (scrollState.isAutoScrollEnabled && !scrollState.isUserScrolling) {
        scrollControls.scrollToBottom();
      }
    }
  }, [streamingContext.currentMessage, streamingContext.updateCount, scrollState.isAutoScrollEnabled, scrollState.isUserScrolling, scrollControls, logger]);

  // Handle keyboard input
  useInput((inputChar: string, key: any) => {
    // Debug: Log all key events to see what's being received
    logger.debug('Key pressed:', { inputChar, key: Object.keys(key).filter(k => key[k]).join(',') });
    
    if (key.ctrl && inputChar === 'c') {
      exit();
      return;
    }

    // Handle Ctrl+X to clear screen
    if (key.ctrl && inputChar === 'x') {
      onClearConversation?.();
      return;
    }

    // Enhanced scroll controls
    if (key.ctrl && inputChar === 's') {
      // Ctrl+S to show more lines / toggle height constraint
      if (constrainHeight) {
        setConstrainHeight(false);
        // Disable auto-scroll when showing more lines (user wants to browse history)
        scrollControls.disableAutoScroll();
        logger.info('Height constraint disabled - showing more lines, auto-scroll disabled');
      } else {
        scrollControls.toggleAutoScroll();
        logger.info('Auto-scroll toggled', {
          enabled: !scrollState.isAutoScrollEnabled
        });
      }
      return;
    }
    
    // Ctrl+H to toggle height constraint
    if (key.ctrl && inputChar === 'h') {
      setConstrainHeight(!constrainHeight);
      logger.info('Height constraint toggled', { constrainHeight: !constrainHeight });
      return;
    }

    // Ctrl+R to expand/collapse compaction summaries
    if (key.ctrl && inputChar === 'r') {
      // TODO: Implement compaction summary expansion toggle
      // This would require tracking expansion state and passing toggle callback
      logger.info('Ctrl+R pressed - compaction summary expansion toggle');
      return;
    }

    // Enhanced navigation keys
    if (key.ctrl && (inputChar === 'home' || key.home)) {
      setConstrainHeight(false); // Show full history
      logger.info('User pressed Ctrl+Home - scroll to top and show all');
      return;
    }
    
    if (key.ctrl && (inputChar === 'end' || key.end)) {
      setConstrainHeight(true); // Return to constrained view
      scrollControls.enableAutoScroll();
      scrollControls.scrollToBottom();
      logger.info('User pressed Ctrl+End - scroll to bottom and constrain height');
      return;
    }

    // Handle permission responses
    if (pendingPermission) {
      if (inputChar === 'y' || inputChar === 'Y') {
        onPermissionResponse?.('yes');
        return;
      }
      if (inputChar === 'n' || inputChar === 'N') {
        onPermissionResponse?.('no');
        return;
      }
      if (inputChar === 's' || inputChar === 'S') {
        onPermissionResponse?.('session');
        return;
      }
      return;
    }

    // Handle message submission
    if (key.return && !isProcessing && !pendingPermission && !key.shift) {
      handleSubmit();
      return;
    }
    
    // Handle shift+enter for new lines
    if (key.return && key.shift && !isProcessing && !pendingPermission) {
      const currentPos = cursorPosition;
      const newInput = input.slice(0, currentPos) + '\n' + input.slice(currentPos);
      setInput(newInput);
      setCursorPosition(currentPos + 1);
      setDisplayCursorPosition(currentPos + 1);
      return;
    }

    // Handle text input
    if (!key.ctrl && !key.meta && !pendingPermission && inputChar.length >= 1) {
      const currentPos = cursorPosition;
      
      // For paste operations, don't add trailing newlines that would trigger auto-submit
      let processedChar = inputChar;
      // Only detect actual paste operations - large content or structured data
      // Don't treat small multi-character inputs (like \r from Shift+Enter) as paste
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
      
      // Calculate display cursor position after paste blocks are updated
      // We need to do this in the setPasteBlocks callback to ensure we have the latest blocks
                     
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
        
        // Clear any existing paste completion timeout
        if (pasteTimeoutRef.current) {
          clearTimeout(pasteTimeoutRef.current);
        }
        
        // Check if this should be merged with the last paste block
        setPasteBlocks(prev => {
          const lastBlock = prev[prev.length - 1];
          const shouldMerge = lastBlock && 
                             lastBlock.end === currentPos &&
                             (Date.now() - lastPasteTime) < 1000; // Within 1 second
          
          let updatedBlocks;
          let newCursorPos = currentPos + processedChar.length;
          
          if (shouldMerge) {
            // Merge with the last paste block
            updatedBlocks = [...prev];
            const newEnd = currentPos + processedChar.length;
            const mergedContent = lastBlock.content + inputChar;
            updatedBlocks[updatedBlocks.length - 1] = {
              ...lastBlock,
              end: newEnd,
              content: mergedContent
            };
          } else {
            // Create new paste block - use original inputChar for content tracking
            const newPasteBlock = {
              start: currentPos,
              end: currentPos + processedChar.length,
              content: inputChar // Store original content, not processed
            };
            updatedBlocks = [...prev, newPasteBlock];
          }
          
          // Calculate display cursor position with the new paste blocks
          let displayPos = newCursorPos;
          const sortedBlocks = [...updatedBlocks].sort((a, b) => a.start - b.start);
          
          for (const block of sortedBlocks) {
            if (newCursorPos > block.start && block.content.length > 1000) {
              const blockLines = block.content.split(/\r\n|\r|\n/);
              const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
              const adjustment = indicator.length - (block.end - block.start);
              displayPos += adjustment;
            }
          }
          
          setDisplayCursorPosition(displayPos);
          return updatedBlocks;
        });
        
        // Set timeout to detect paste completion and add automatic spacing for large pastes
        pasteTimeoutRef.current = setTimeout(() => {
          setPasteBlocks(prev => {
            const lastBlock = prev[prev.length - 1];
            if (lastBlock && lastBlock.content.length > 1000) {
              // Add a space after large paste blocks for easier continued typing
              const spacePos = lastBlock.end;
              
              setInput(prevInput => {
                const newInput = prevInput.slice(0, spacePos) + ' ' + prevInput.slice(spacePos);
                return newInput;
              });
              
              setCursorPosition(spacePos + 1);
              
              // Update paste blocks positions after inserting space
              const updatedBlocks = prev.map(block => ({
                ...block,
                start: block.start > spacePos ? block.start + 1 : block.start,
                end: block.end > spacePos ? block.end + 1 : block.end
              }));
              
              // Update display cursor position
              let newDisplayPos = spacePos + 1;
              const sortedBlocks = [...updatedBlocks].sort((a, b) => a.start - b.start);
              for (const block of sortedBlocks) {
                if (newDisplayPos > block.start && block.content.length > 1000) {
                  const blockLines = block.content.split(/\r\n|\r|\n/);
                  const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
                  const adjustment = indicator.length - (block.end - block.start);
                  newDisplayPos += adjustment;
                }
              }
              setDisplayCursorPosition(newDisplayPos);
              
              return updatedBlocks;
            }
            return prev;
          });
        }, 300); // Wait 300ms after last paste chunk to add spacing
        
        setIsPastedContent(true);
      } else {
        // Regular typing - clear any pending paste timeout
        if (pasteTimeoutRef.current) {
          clearTimeout(pasteTimeoutRef.current);
          pasteTimeoutRef.current = null;
        }
        
        // For regular typing, just update display cursor position
        const newCursorPos = currentPos + processedChar.length;
        let displayPos = newCursorPos;
        const sortedBlocks = [...pasteBlocks].sort((a, b) => a.start - b.start);
        
        for (const block of sortedBlocks) {
          if (newCursorPos > block.start && block.content.length > 1000) {
            const blockLines = block.content.split(/\r\n|\r|\n/);
            const indicator = `[Pasted ${blockLines.length > 1 ? `${blockLines.length} lines` : `${block.content.length} chars`}]`;
            const adjustment = indicator.length - (block.end - block.start);
            displayPos += adjustment;
          }
        }
        
        setDisplayCursorPosition(displayPos);
      }
      
      return;
    }

    // Handle backspace and delete keys - both work like backspace for intuitive editing
    if ((key.backspace || key.delete) && !pendingPermission && cursorPosition > 0) {
      logger.debug('Delete key pressed', { backspace: key.backspace, delete: key.delete, cursorPos: cursorPosition, inputLength: input.length });
      
      // Check if cursor is within a large paste block (>1000 chars)
      const largePasteBlock = pasteBlocks.find(block => 
        block.content.length > 1000 && 
        cursorPosition >= block.start && 
        cursorPosition <= block.end
      );
      
      if (largePasteBlock) {
        // Delete the entire large paste block
        const newInput = input.slice(0, largePasteBlock.start) + input.slice(largePasteBlock.end);
        setInput(newInput);
        const newPos = largePasteBlock.start;
        setCursorPosition(newPos);
        setDisplayCursorPosition(newPos);
        
        // Remove this paste block from tracking
        setPasteBlocks(prev => prev.filter(block => block !== largePasteBlock));
        
        // Update remaining paste blocks positions
        setPasteBlocks(prev => prev.map(block => {
          const deletedLength = largePasteBlock.end - largePasteBlock.start;
          if (block.start > largePasteBlock.end) {
            return {
              ...block,
              start: block.start - deletedLength,
              end: block.end - deletedLength
            };
          }
          return block;
        }));
        
        logger.debug('Large paste block deleted', { blockLength: largePasteBlock.content.length, newPos });
        return;
      }
      
      // Standard character deletion
      const newInput = input.slice(0, cursorPosition - 1) + input.slice(cursorPosition);
      setInput(newInput);
      const newPos = Math.max(0, cursorPosition - 1);
      setCursorPosition(newPos);
      setDisplayCursorPosition(newPos);
      
      // Update paste block positions after character deletion
      setPasteBlocks(prev => prev.map(block => {
        if (block.start >= cursorPosition) {
          return {
            ...block,
            start: block.start - 1,
            end: block.end - 1
          };
        } else if (block.end > cursorPosition) {
          return {
            ...block,
            end: block.end - 1
          };
        }
        return block;
      }));
      
      logger.debug('Character deleted', { keyType: key.backspace ? 'backspace' : 'delete', newInput, newPos });
      return;
    }

    // Handle arrow keys for cursor movement - simplified with logging
    if (key.leftArrow && !pendingPermission) {
      const newPos = Math.max(0, cursorPosition - 1);
      setCursorPosition(newPos);
      setDisplayCursorPosition(newPos);
      logger.debug('Left arrow', { oldPos: cursorPosition, newPos });
      return;
    }
    
    if (key.rightArrow && !pendingPermission) {
      const newPos = Math.min(input.length, cursorPosition + 1);
      setCursorPosition(newPos);
      setDisplayCursorPosition(newPos);
      logger.debug('Right arrow', { oldPos: cursorPosition, newPos });
      return;
    }
    
    // Handle up/down arrows for multi-line input
    if (key.upArrow && !pendingPermission) {
      const lines = input.split('\n');
      logger.debug('Up arrow pressed', { lines: lines.length, cursorPos: cursorPosition });
      
      if (lines.length <= 1) {
        logger.debug('Up arrow: single line, ignoring');
        return;
      }
      
      let currentOffset = 0;
      let currentLine = 0;
      let currentCol = cursorPosition;
      
      // Find current line and column
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length;
        if (currentOffset + lineLength >= cursorPosition) {
          currentLine = i;
          currentCol = cursorPosition - currentOffset;
          break;
        }
        currentOffset += lineLength + 1; // +1 for newline
      }
      
      logger.debug('Up arrow: current position', { currentLine, currentCol, totalLines: lines.length });
      
      // Move to previous line if possible
      if (currentLine > 0) {
        const prevLineLength = lines[currentLine - 1].length;
        const newCol = Math.min(currentCol, prevLineLength);
        let newOffset = 0;
        for (let i = 0; i < currentLine - 1; i++) {
          newOffset += lines[i].length + 1;
        }
        const newPosition = newOffset + newCol;
        setCursorPosition(newPosition);
        setDisplayCursorPosition(newPosition);
        logger.debug('Up arrow: moved to', { newLine: currentLine - 1, newCol, newPosition });
      } else {
        logger.debug('Up arrow: already at top line');
      }
      return;
    }
    
    if (key.downArrow && !pendingPermission) {
      const lines = input.split('\n');
      logger.debug('Down arrow pressed', { lines: lines.length, cursorPos: cursorPosition });
      
      if (lines.length <= 1) {
        logger.debug('Down arrow: single line, ignoring');
        return;
      }
      
      let currentOffset = 0;
      let currentLine = 0;
      let currentCol = cursorPosition;
      
      // Find current line and column
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length;
        if (currentOffset + lineLength >= cursorPosition) {
          currentLine = i;
          currentCol = cursorPosition - currentOffset;
          break;
        }
        currentOffset += lineLength + 1; // +1 for newline
      }
      
      logger.debug('Down arrow: current position', { currentLine, currentCol, totalLines: lines.length });
      
      // Move to next line if possible
      if (currentLine < lines.length - 1) {
        const nextLineLength = lines[currentLine + 1].length;
        const newCol = Math.min(currentCol, nextLineLength);
        let newOffset = 0;
        for (let i = 0; i <= currentLine; i++) {
          newOffset += lines[i].length + 1;
        }
        const newPosition = newOffset + newCol;
        setCursorPosition(newPosition);
        setDisplayCursorPosition(newPosition);
        logger.debug('Down arrow: moved to', { newLine: currentLine + 1, newCol, newPosition });
      } else {
        logger.debug('Down arrow: already at bottom line');
      }
      return;
    }
  });

  const handleSubmit = useCallback(async () => {
    const messageToSend = input.trim();
    
    if (messageToSend && !isProcessing) {
      // Clear the input state first
      setInput('');
      setCursorPosition(0);
      setDisplayCursorPosition(0);
      setIsPastedContent(false);
      setPasteBlocks([]);
      
      
      // Send the message
      await onMessage(messageToSend);
      
      // Enhanced post-message handling - NO refreshStatic!
      setTimeout(() => {
        // Only auto-scroll if user is already at bottom, preserve manual scroll position
        if (scrollState.isAutoScrollEnabled) {
          scrollControls.scrollToBottom();
        }
        setConstrainHeight(true); // Return to normal view
      }, 50);
    }
  }, [input, isProcessing, onMessage, scrollControls, scrollState.isAutoScrollEnabled, logger]);

  return (
    <App
      context={context}
      onMessage={onMessage}
      isProcessing={isProcessing}
      isCompacting={isCompacting}
      pendingPermission={pendingPermission}
      onPermissionResponse={onPermissionResponse}
      sessionApprovals={sessionApprovals}
      onClearConversation={onClearConversation}
      onCompactConversation={onCompactConversation}
      terminalWidth={uiState.terminalWidth}
      terminalHeight={uiState.terminalHeight}
      mainAreaWidth={uiState.mainAreaWidth}
      constrainHeight={uiState.constrainHeight}
      historyRemountKey={uiState.historyRemountKey}
      availableHeight={uiState.availableHeight}
      input={input}
      onInputChange={setInput}
      cursorPosition={cursorPosition}
      pasteBlocks={pasteBlocks}
    />
  );
};

// Main Terminal component with StreamingProvider
const Terminal: React.FC<TerminalProps> = (props) => {
  return (
    <StreamingProvider>
      <TerminalContent {...props} />
    </StreamingProvider>
  );
};

export default Terminal;