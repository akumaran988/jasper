import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useInput, useApp, useStdout } from 'ink';
import ansiEscapes from 'ansi-escapes';
import { ConversationContext, PermissionContext, PermissionResponse, PermissionRule, SlashCommand } from '../types/index.js';
import { permissionRegistry } from '../permissions/registry.js';
import { App } from './App.js';
import { useAutoScroll } from '../hooks/useAutoScroll.js';
import { getLogger } from '../utils/logger.js';
import { StreamingProvider, useStreamingContext } from '../contexts/StreamingContext.js';

// Terminal sizing constants (following gemini-cli patterns)
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

// Streaming states for better UX (inspired by gemini-cli)
enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation'
}

// UI State interface (following gemini-cli architecture)
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

  // Terminal size management (gemini-cli pattern)
  const [terminalSize, setTerminalSize] = useState({
    columns: (process.stdout.columns || 60) - TERMINAL_PADDING_X,
    rows: process.stdout.rows || 20,
  });
  
  const isInitialMount = React.useRef(true);

  useEffect(() => {
    function updateSize() {
      setTerminalSize({
        columns: (process.stdout.columns || 60) - TERMINAL_PADDING_X,
        rows: process.stdout.rows || 20,
      });
    }

    process.stdout.on('resize', updateSize);
    return () => {
      process.stdout.off('resize', updateSize);
    };
  }, []);

  // UI State management (gemini-cli architecture)
  const [constrainHeight, setConstrainHeight] = useState(true);
  const [historyRemountKey, setHistoryRemountKey] = useState(0);
  
  // Refresh static content function (gemini-cli pattern)
  const { stdout } = useStdout();
  const refreshStatic = useCallback(() => {
    stdout.write(ansiEscapes.clearTerminal); // Clear terminal like gemini-cli
    setHistoryRemountKey((prev) => prev + 1);
    logger.debug('Terminal refreshed due to resize', {
      columns: terminalSize.columns,
      rows: terminalSize.rows
    });
  }, [logger, terminalSize, stdout]);
  
  // Terminal refresh on resize (gemini-cli exact pattern)
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
    const calculatedHeight = terminalSize.rows - 10; // Account for input and padding
    
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

  // Enhanced auto-scroll functionality with streaming support (gemini-cli inspired)
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

  // Handle keyboard input (following gemini-cli patterns)
  useInput((inputChar: string, key: any) => {
    // Debug: Log all key events to see what's being received
    logger.debug('Key pressed:', { inputChar, key: Object.keys(key).filter(k => key[k]).join(',') });
    
    if (key.ctrl && inputChar === 'c') {
      exit();
      return;
    }

    // Enhanced scroll controls (gemini-cli pattern)
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

    // Enhanced navigation keys (gemini-cli pattern)
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
      const newInput = input.slice(0, currentPos) + inputChar + input.slice(currentPos);
      setInput(newInput);
      const newPos = currentPos + inputChar.length;
      setCursorPosition(newPos);
      setDisplayCursorPosition(newPos);
      logger.debug('Text input', { char: inputChar, oldInput: input, newInput, oldPos: currentPos, newPos });
      return;
    }

    // Handle backspace and delete keys - both work like backspace for intuitive editing
    if ((key.backspace || key.delete) && !pendingPermission && cursorPosition > 0) {
      logger.debug('Delete key pressed', { backspace: key.backspace, delete: key.delete, cursorPos: cursorPosition, inputLength: input.length });
      
      // Both backspace and delete behave the same: delete character before cursor
      const newInput = input.slice(0, cursorPosition - 1) + input.slice(cursorPosition);
      setInput(newInput);
      const newPos = Math.max(0, cursorPosition - 1);
      setCursorPosition(newPos);
      setDisplayCursorPosition(newPos);
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
      
      // Enhanced post-message handling (gemini-cli pattern) - NO refreshStatic!
      setTimeout(() => {
        // Only auto-scroll if user is already at bottom, preserve manual scroll position
        if (scrollState.isAutoScrollEnabled) {
          scrollControls.scrollToBottom();
        }
        setConstrainHeight(true); // Return to normal view
      }, 50);
    }
  }, [input, isProcessing, onMessage, scrollControls, refreshStatic, logger]);

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
      isPasted={isPastedContent}
      cursorPosition={displayCursorPosition}
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