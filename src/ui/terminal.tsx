import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { ConversationContext, PermissionContext, PermissionResponse, PermissionRule, SlashCommand } from '../types/index.js';
import { permissionRegistry } from '../permissions/registry.js';
import MessageRenderer from './renderer.js';
import InputHandler from './input.js';
import WelcomeMessage from './welcome.js';
import { useAutoScroll } from '../hooks/useAutoScroll.js';
import { getLogger } from '../utils/logger.js';

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

const Terminal: React.FC<TerminalProps> = ({ 
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
  const { exit } = useApp();
  const { stdout } = useStdout();
  const logger = useMemo(() => getLogger(), []);
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  
  // Slash command states
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // Clear terminal on app startup (only once)
  useEffect(() => {
    // Clear the terminal screen once on startup
    process.stdout.write('\x1b[2J\x1b[H');
  }, []); // Empty dependency array means this runs only once on mount

  // Hide welcome message when user starts interacting (has messages)
  useEffect(() => {
    if (context.messages.length > 0) {
      setShowWelcome(false);
    }
  }, [context.messages.length]);
  
  // Define available slash commands (Claude Code-style)
  const slashCommands: SlashCommand[] = useMemo(() => [
    {
      name: 'add-dir',
      description: 'Add a new working directory',
      arguments: '<path>',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        logger.info('Add directory functionality');
        // TODO: Implement add directory
      }
    },
    {
      name: 'agents',
      description: 'Manage agent configurations',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        logger.info('Agent management');
        // TODO: Implement agent management
      }
    },
    {
      name: 'bashes',
      description: 'List and manage background bash shells',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        logger.info('Background bash management');
        // TODO: Implement bash management
      }
    },
    {
      name: 'bug',
      description: 'Submit feedback about Jasper',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        logger.info('Bug reporting');
        // TODO: Implement bug reporting
      }
    },
    {
      name: 'clear',
      description: 'Clear conversation history and free up context',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        setShowWelcome(true); // Show welcome message after clearing
        onClearConversation?.();
        logger.info('Conversation cleared');
      }
    },
    {
      name: 'compact',
      description: 'Clear conversation history but keep a summary in context',
      arguments: '[instructions]',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        onCompactConversation?.();
        logger.info('Conversation compacted');
      }
    },
    {
      name: 'config',
      description: 'Open config panel',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        logger.info('Opening config');
        // TODO: Implement config panel
      }
    },
    {
      name: 'cost',
      description: 'Show the total cost and duration of the current session',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        logger.info('Showing cost information');
        // TODO: Implement cost tracking
      }
    },
    {
      name: 'doctor',
      description: 'Diagnose and verify your Jasper installation and settings',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        logger.info('Running diagnostics');
        // TODO: Implement diagnostics
      }
    },
    {
      name: 'exit',
      description: 'Exit the REPL',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        process.exit(0);
      }
    },
    {
      name: 'permissions',
      description: 'Manage tool permissions for this session',
      handler: () => {
        setInput('');
        setCursorPosition(0);
        setShowCommandSuggestions(false);
        logger.info('Opening permissions management');
        // TODO: Implement permissions UI
      }
    }
  ], [logger, onClearConversation, onCompactConversation]);
  const [displayCursorPosition, setDisplayCursorPosition] = useState(0); // Track cursor in display coordinates
  const [isPastedContent, setIsPastedContent] = useState(false);
  const [pasteBlocks, setPasteBlocks] = useState<Array<{start: number, end: number, content: string}>>([]);
  const [animationFrame] = useState(0);
  const [lastPasteTime, setLastPasteTime] = useState(0);
  
  // Track scroll position for manual scroll detection
  const [userScrollOffset, setUserScrollOffset] = useState(0);
  const messagesRef = useRef<any>(null);
  
  // Track expanded tool results by message index and result index
  const [expandedToolResults, setExpandedToolResults] = useState<Set<string>>(new Set());
  
  // Track which tool result is currently focused/selected
  const [focusedToolResult, setFocusedToolResult] = useState<string | null>(null);
  
  // Track if we're actively navigating tool results to prevent auto-scroll interference
  const [isNavigatingToolResults, setIsNavigatingToolResults] = useState(false);
  
  // Auto-scroll functionality
  const [scrollState, scrollControls] = useAutoScroll(
    context.messages.length,
    isProcessing,
    !!pendingPermission,
    {
      enabled: true,
      scrollToBottomOnUpdate: !isNavigatingToolResults, // Disable auto-scroll during navigation
      disableOnManualScroll: true,
      debugLogging: true
    }
  );
  
  // Track pagination for tool results (when more than 9)
  const [toolResultPage, setToolResultPage] = useState(0); // 0 = results 1-9, 1 = results 10-18, etc.
  
  // Helper function to get all tool result keys
  const getAllToolResultKeys = useCallback(() => {
    const toolResultKeys: string[] = [];
    logger.debug('Checking messages for tool results:', context.messages.map((msg, idx) => ({
      index: idx,
      role: msg.role,
      contentStart: msg.content.substring(0, 50),
      isToolResult: msg.role === 'system' && msg.content.startsWith('Tool execution results:')
    })));
    
    context.messages.forEach((msg, msgIndex) => {
      if (msg.role === 'system' && msg.content.startsWith('Tool execution results:')) {
        const results = msg.content.replace('Tool execution results:\n', '').split('\n\n');
        results.forEach((_, resultIndex) => {
          toolResultKeys.push(`${msgIndex}-${resultIndex}`);
        });
      }
    });
    logger.debug('Found tool result keys:', toolResultKeys);
    return toolResultKeys;
  }, [context.messages, logger]);
  
  // DISABLED: Auto-focus was interfering with manual selection
  // useEffect(() => {
  //   const systemMessages = context.messages.filter(m => 
  //     m.role === 'system' && m.content.startsWith('Tool execution results:')
  //   );
  //   
  //   if (systemMessages.length > 0) {
  //     const lastSystemIndex = context.messages.findIndex(m => m === systemMessages[systemMessages.length - 1]);
  //     const mostRecentKey = `${lastSystemIndex}-0`;
  //     
  //     // Only auto-focus if no tool result is currently focused, or if this is a new one
  //     if (!focusedToolResult || !focusedToolResult.startsWith(lastSystemIndex.toString())) {
  //       setFocusedToolResult(mostRecentKey);
  //       logger.debug('Auto-focused most recent tool result:', mostRecentKey);
  //     }
  //   }
  // }, [context.messages.length, focusedToolResult, logger]);
  
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

    // Remove Tab navigation - it's too complex for terminal UI

    // Handle Tab completion for slash commands
    if (key.tab && showCommandSuggestions && input.startsWith('/')) {
      const commandName = input.slice(1);
      const matchingCommands = slashCommands.filter(cmd => 
        cmd.name.startsWith(commandName.toLowerCase())
      );
      
      if (matchingCommands.length > 0) {
        const selectedCommand = matchingCommands[selectedCommandIndex] || matchingCommands[0];
        setInput('/' + selectedCommand.name);
        setCursorPosition(selectedCommand.name.length + 1);
        setShowCommandSuggestions(false);
      }
      return;
    }

    // Handle Up/Down arrow navigation for slash commands
    if ((key.upArrow || key.downArrow) && showCommandSuggestions && !pendingPermission) {
      const commandName = input.slice(1);
      const matchingCommands = slashCommands.filter(cmd => 
        cmd.name.startsWith(commandName.toLowerCase())
      );
      
      if (matchingCommands.length > 0) {
        if (key.upArrow) {
          setSelectedCommandIndex(prev => prev > 0 ? prev - 1 : matchingCommands.length - 1);
        } else {
          setSelectedCommandIndex(prev => prev < matchingCommands.length - 1 ? prev + 1 : 0);
        }
      }
      return;
    }

    // Handle Up/Down arrow navigation for tool results (only when not in permission prompt)
    if ((key.upArrow || key.downArrow) && !pendingPermission && !showCommandSuggestions) {
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
        
        // Mark as actively navigating to prevent auto-scroll interference
        setIsNavigatingToolResults(true);
        
        // Clear navigation state after a short delay
        setTimeout(() => setIsNavigatingToolResults(false), 500);
        
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
        
        // Mark as actively navigating to prevent auto-scroll interference
        setIsNavigatingToolResults(true);
        setTimeout(() => setIsNavigatingToolResults(false), 500);
        
        logger.info('Jumped to tool result:', newFocused, key.upArrow ? '(first)' : '(last)');
      }
      return;
    }

    // Handle number keys (1-9) to quickly focus tool results (only when not in permission prompt)
    if (!key.ctrl && !key.meta && inputChar >= '1' && inputChar <= '9' && !pendingPermission) {
      const toolResultKeys = getAllToolResultKeys();
      const keyNumber = parseInt(inputChar);
      const arrayIndex = keyNumber - 1; // Convert 1-based to 0-based array index
      
      if (arrayIndex < toolResultKeys.length) {
        const targetKey = toolResultKeys[arrayIndex];
        setFocusedToolResult(targetKey);
        
        // Mark as actively navigating to prevent auto-scroll interference
        setIsNavigatingToolResults(true);
        setTimeout(() => setIsNavigatingToolResults(false), 500);
        
        logger.info('Quick-focused tool result:', targetKey, `(key ${inputChar} -> array index ${arrayIndex}, total keys: ${toolResultKeys.length}, keys: ${JSON.stringify(toolResultKeys)})`);
      } else {
        logger.warn('Key selection failed:', `key ${inputChar} -> array index ${arrayIndex}, but only ${toolResultKeys.length} results available: ${JSON.stringify(toolResultKeys)}`);
      }
      return;
    }

    // Handle tool result expansion (Ctrl+E)
    if (key.ctrl && inputChar === 'e') {
      const toolResultKeys = getAllToolResultKeys();
      let targetResultKey = focusedToolResult;
      
      if (!targetResultKey && toolResultKeys.length > 0) {
        // Use the most recent (last) tool result if no specific focus
        targetResultKey = toolResultKeys[toolResultKeys.length - 1];
        logger.info('No focused result, using most recent:', targetResultKey);
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
      // Check if we should handle tool result pagination instead of scrolling
      const toolResultKeys = getAllToolResultKeys();
      const totalPages = Math.ceil(toolResultKeys.length / 9);
      
      if (toolResultKeys.length > 9) {
        // Handle tool result pagination
        if (key.pageUp && toolResultPage > 0) {
          setToolResultPage(toolResultPage - 1);
          logger.info(`Tool result page up: ${toolResultPage - 1} (showing results ${(toolResultPage - 1) * 9 + 1}-${Math.min(toolResultKeys.length, toolResultPage * 9)})`);
          return;
        } else if (key.pageDown && toolResultPage < totalPages - 1) {
          setToolResultPage(toolResultPage + 1);
          logger.info(`Tool result page down: ${toolResultPage + 1} (showing results ${toolResultPage * 9 + 10}-${Math.min(toolResultKeys.length, (toolResultPage + 1) * 9 + 9)})`);
          return;
        }
      }
      
      // Fall back to regular scrolling if not paginating tool results
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
        const totalMessages = context.messages.length;
        const newOffset = userScrollOffset + scrollAmount;
        
        // Don't scroll past the end of messages
        if (newOffset >= totalMessages) {
          // At the end - enable auto-scroll and reset offset
          setUserScrollOffset(0);
          scrollControls.enableAutoScroll();
          logger.info('Reached end of messages - enabling auto-scroll');
        } else {
          setUserScrollOffset(newOffset);
          logger.warn('⬇️ Manual scroll down executed', { 
            previousOffset: userScrollOffset,
            newOffset,
            scrollAmount,
            totalMessages
          });
        }
      }
      return;
    }

    // Home/End keys for quick navigation
    if (key.ctrl && (inputChar === 'home' || key.home)) {
      const toolResultKeys = getAllToolResultKeys();
      if (toolResultKeys.length > 9) {
        // Reset tool result pagination to first page
        setToolResultPage(0);
        logger.info('Reset tool result page to 0 (showing results 1-9)');
      } else {
        // Regular scroll to top
        setUserScrollOffset(0);
        scrollControls.disableAutoScroll();
        logger.info('User pressed Ctrl+Home - scroll to top', {
          previousOffset: userScrollOffset,
          autoScrollPreviouslyEnabled: scrollState.isAutoScrollEnabled
        });
      }
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
        // Handle slash commands
        if (showCommandSuggestions && input.startsWith('/')) {
          const commandName = input.slice(1);
          const matchingCommands = slashCommands.filter(cmd => 
            cmd.name.startsWith(commandName.toLowerCase())
          );
          
          if (matchingCommands.length > 0) {
            const selectedCommand = matchingCommands[selectedCommandIndex] || matchingCommands[0];
            selectedCommand.handler();
            // Close command suggestions after executing command
            setShowCommandSuggestions(false);
            setSelectedCommandIndex(0);
            return;
          }
        }
        
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
          const newInput = input.slice(0, cursorPosition - 1) + input.slice(cursorPosition);
          setInput(newInput);
          setCursorPosition(prev => Math.max(0, prev - 1));
          
          // Close command suggestions if we're deleting the '/' or the input no longer starts with '/'
          if (showCommandSuggestions && (!newInput.startsWith('/') || newInput.length === 0)) {
            setShowCommandSuggestions(false);
            setSelectedCommandIndex(0);
          }
          
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
      
      // Check for slash command detection
      const newInput = input.slice(0, currentPos) + processedChar + input.slice(currentPos);
      if (newInput.startsWith('/') && cursorPosition === 0 && newInput.length === 1) {
        // User just typed '/' at the beginning - show command suggestions
        setShowCommandSuggestions(true);
        setSelectedCommandIndex(0);
      } else if (newInput.startsWith('/') && newInput.indexOf(' ') === -1) {
        // User is typing a command - filter suggestions
        setShowCommandSuggestions(true);
      } else if (!newInput.startsWith('/')) {
        // User cleared slash or typed something else
        setShowCommandSuggestions(false);
      }
                     
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
      
      // Hide welcome message when user sends first message
      if (showWelcome) {
        setShowWelcome(false);
      }
      
      await onMessage(messageToSend);
    }
  }, [input, isProcessing, onMessage]);

  return (
    <Box flexDirection="column" minHeight={3}>

      {/* Welcome Message */}
      {showWelcome && <WelcomeMessage />}

      {/* Messages */}
      <Box ref={messagesRef} flexDirection="column" flexGrow={1} justifyContent="flex-end">
        {(() => {
          const filteredMessages = context.messages.filter(m => 
            m.role !== 'system' || m.content.startsWith('Tool execution results:')
          );
          
          // ALWAYS show ALL messages - no truncation for message persistence
          // The terminal scroll functionality should handle display, not message filtering
          let visibleMessages = filteredMessages;
          
          // Handle manual scrolling by showing messages from the scroll offset
          if (!scrollState.isAutoScrollEnabled && userScrollOffset > 0) {
            // When manually scrolling, show messages starting from the offset
            // But don't limit the total number - let terminal scrolling handle overflow
            const startIndex = Math.max(0, userScrollOffset);
            visibleMessages = filteredMessages.slice(startIndex);
            
            logger.debug('Manual scroll: showing messages from offset', {
              totalMessages: filteredMessages.length,
              startIndex,
              userScrollOffset,
              showingCount: visibleMessages.length,
              autoScrollEnabled: scrollState.isAutoScrollEnabled
            });
          } else {
            // Auto-scroll enabled - show ALL messages (no truncation)
            visibleMessages = filteredMessages;
            
            // Only log occasionally to prevent spam
            if (filteredMessages.length % 10 === 0) {
              logger.debug('Auto-scroll: showing all messages', {
                totalMessages: filteredMessages.length,
                showingAllMessages: true
              });
            }
          }
          
          return visibleMessages.map((message, _index) => {
            const originalIndex = context.messages.findIndex(m => m === message);
            // Create a unique key using timestamp, role, and content hash to prevent duplicates
            const messageKey = `${message.timestamp?.getTime() || Date.now()}-${message.role}-${originalIndex}-${message.content.slice(0, 50).replace(/\s/g, '')}`;
            return (
              <MessageRenderer 
                key={messageKey} 
                message={message} 
                messages={context.messages} 
                index={originalIndex}
                expandedToolResults={expandedToolResults}
                focusedToolResult={focusedToolResult}
                toolResultPage={toolResultPage}
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
        <PermissionSelector 
          pendingPermission={pendingPermission}
          sessionApprovals={sessionApprovals}
          onPermissionResponse={onPermissionResponse}
        />
      )}

      {/* Animated Processing indicator */}
      {isProcessing && !pendingPermission && (
        <AnimatedProcessingIndicator 
          frame={animationFrame} 
          iteration={context.currentIteration}
        />
      )}

      {/* Compacting indicator */}
      {isCompacting && (
        <CompactingIndicator />
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

      {/* Slash command suggestions - positioned below input */}
      {showCommandSuggestions && input.startsWith('/') && (
        <Box flexDirection="column" width="100%" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
          {(() => {
            const commandName = input.slice(1);
            const matchingCommands = slashCommands.filter(cmd => 
              cmd.name.startsWith(commandName.toLowerCase())
            );
            
            return matchingCommands.map((cmd, index) => (
              <Box key={cmd.name} width="100%" justifyContent="space-between">
                <Text color={index === selectedCommandIndex ? 'white' : 'gray'} backgroundColor={index === selectedCommandIndex ? 'blue' : undefined}>
                  /{cmd.name} {cmd.arguments ? cmd.arguments : ''}
                </Text>
                <Text color="gray">
                  {cmd.description}
                </Text>
              </Box>
            ));
          })()}
        </Box>
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
            {(() => {
              const toolResultKeys = getAllToolResultKeys();
              const totalPages = Math.ceil(toolResultKeys.length / 9);
              
              if (toolResultKeys.length > 9) {
                const pageStart = toolResultPage * 9 + 1;
                const pageEnd = Math.min(toolResultKeys.length, (toolResultPage + 1) * 9);
                return (
                  <Text color="blue">
                    1-9:select Ctrl+E:expand Page{toolResultPage + 1}/{totalPages} ({pageStart}-{pageEnd} of {toolResultKeys.length}) PgUp/PgDn:navigate Home:reset
                  </Text>
                );
              } else {
                return <Text color="blue">1-9:select Ctrl+E:expand</Text>;
              }
            })()}
          </Text>
        </Box>
        <Box>
          <Text color="gray" dimColor>
            {pendingPermission 
              ? '⏵⏵ awaiting permission (Y/N to respond)'
              : isCompacting
              ? '⏵⏵ compacting conversation'
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

const PermissionSelector: React.FC<{
  pendingPermission: PermissionContext;
  sessionApprovals: Map<string, PermissionRule>;
  onPermissionResponse?: (response: PermissionResponse) => void;
}> = ({ pendingPermission, sessionApprovals, onPermissionResponse }) => {
  const [selectedOption, setSelectedOption] = useState<PermissionResponse>('yes');
  
  // Generate descriptive label for session permission using the registry
  const getSessionLabel = () => {
    return permissionRegistry.getSessionDescription(pendingPermission.toolCall);
  };

  const options: Array<{value: PermissionResponse, label: string, color: string, key: string}> = [
    { value: 'yes', label: 'Yes (just this time)', color: 'green', key: 'Y' },
    { value: 'session', label: getSessionLabel(), color: 'blue', key: 'S' },
    { value: 'no', label: 'No, let me give different instructions', color: 'red', key: 'N' }
  ];

  useInput((inputChar: string, key: any) => {
    if (key.upArrow) {
      const currentIndex = options.findIndex(opt => opt.value === selectedOption);
      const newIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
      setSelectedOption(options[newIndex].value);
      return;
    }
    
    if (key.downArrow) {
      const currentIndex = options.findIndex(opt => opt.value === selectedOption);
      const newIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
      setSelectedOption(options[newIndex].value);
      return;
    }
    
    if (key.return) {
      onPermissionResponse?.(selectedOption);
      return;
    }
    
    // Handle keyboard shortcuts
    const option = options.find(opt => opt.key.toLowerCase() === inputChar.toLowerCase());
    if (option) {
      onPermissionResponse?.(option.value);
      return;
    }
  });

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
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
      {sessionApprovals.size > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="green">
            ℹ️ Current session approvals:
          </Text>
          {Array.from(sessionApprovals.values()).map((rule, index) => (
            <Text key={index} color="gray">
              • {rule.toolName} {rule.scope === 'folder' ? `(${rule.scopeValue})` : 
                                rule.scope === 'domain' ? `(${rule.scopeValue})` : ''}
            </Text>
          ))}
        </Box>
      )}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray">Select an option (↑↓ arrows to navigate, Enter to confirm):</Text>
      </Box>
      {options.map((option) => (
        <Box key={option.value} marginBottom={0}>
          <Text color={selectedOption === option.value ? option.color : 'gray'}>
            {selectedOption === option.value ? '▶ ' : '  '}
            <Text bold={selectedOption === option.value} color={selectedOption === option.value ? option.color : 'gray'}>
              ({option.key})
            </Text>
            <Text color={selectedOption === option.value ? option.color : 'gray'}> {option.label}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
};

const CompactingIndicator: React.FC = () => {
  const [frame, setFrame] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % 60);
    }, 100);
    return () => clearInterval(interval);
  }, []);
  
  const compressIcons = ['🗜️', '📦', '🤏', '💾', '📊'];
  const currentIcon = compressIcons[Math.floor(frame / 12) % compressIcons.length];
  
  const colors = ['cyan', 'yellow', 'magenta', 'green'];
  const currentColor = colors[Math.floor(frame / 15) % colors.length];
  
  return (
    <Box marginTop={1}>
      <Text color={currentColor as any}>
        {currentIcon} Compacting conversation...
      </Text>
      <Text color="gray" dimColor>
        {' '}(creating summary to save context)
      </Text>
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