import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getLogger } from '../utils/logger.js';

export interface AutoScrollConfig {
  enabled?: boolean;
  scrollToBottomOnUpdate?: boolean;
  disableOnManualScroll?: boolean;
  scrollSensitivity?: number; // pixels from bottom to consider "at bottom"
  debugLogging?: boolean;
}

export interface AutoScrollState {
  isAutoScrollEnabled: boolean;
  isUserScrolling: boolean;
  isAtBottom: boolean;
  messageCount: number;
  lastScrollTime: number;
}

export interface AutoScrollControls {
  scrollToBottom: () => void;
  enableAutoScroll: () => void;
  disableAutoScroll: () => void;
  toggleAutoScroll: () => void;
  resetScrollState: () => void;
}

export function useAutoScroll(
  messagesLength: number,
  isProcessing: boolean,
  pendingPermission: boolean,
  config: AutoScrollConfig = {}
): [AutoScrollState, AutoScrollControls] {
  const logger = useMemo(() => getLogger(), []);
  
  const defaultConfig: Required<AutoScrollConfig> = {
    enabled: true,
    scrollToBottomOnUpdate: true,
    disableOnManualScroll: true,
    scrollSensitivity: 100,
    debugLogging: true,
    ...config
  };

  const [state, setState] = useState<AutoScrollState>({
    isAutoScrollEnabled: defaultConfig.enabled,
    isUserScrolling: false,
    isAtBottom: true,
    messageCount: messagesLength,
    lastScrollTime: Date.now()
  });

  // Track previous values to detect changes
  const prevValuesRef = useRef({
    messagesLength,
    isProcessing,
    pendingPermission
  });

  const scrollToBottom = useCallback(() => {
    const timestamp = Date.now();
    logger.info('AutoScroll: scrollToBottom() called');
    
    // In terminal/Ink context, we simulate scrolling by updating state
    // The actual scrolling behavior is handled by the terminal layout
    setState(prev => ({
      ...prev,
      isAtBottom: true,
      isUserScrolling: false, // Clear user scrolling when explicitly scrolling to bottom
      lastScrollTime: timestamp
    }));
  }, [defaultConfig.debugLogging]);

  const enableAutoScroll = useCallback(() => {
    if (defaultConfig.debugLogging) {
      logger.info('AutoScroll: Enabling auto-scroll');
    }
    setState(prev => ({
      ...prev,
      isAutoScrollEnabled: true,
      isUserScrolling: false // Clear user scrolling flag when explicitly enabled
    }));
  }, [defaultConfig.debugLogging]);

  const disableAutoScroll = useCallback(() => {
    if (defaultConfig.debugLogging) {
      logger.debug('AutoScroll: Disabling auto-scroll');
    }
    setState(prev => ({
      ...prev,
      isAutoScrollEnabled: false,
      isUserScrolling: true
    }));
  }, [defaultConfig.debugLogging]);

  const toggleAutoScroll = useCallback(() => {
    setState(prev => {
      const newEnabled = !prev.isAutoScrollEnabled;
      if (defaultConfig.debugLogging) {
        logger.debug(`AutoScroll: Toggling auto-scroll to ${newEnabled}`);
      }
      return {
        ...prev,
        isAutoScrollEnabled: newEnabled,
        isUserScrolling: !newEnabled
      };
    });
  }, [defaultConfig.debugLogging]);

  const resetScrollState = useCallback(() => {
    if (defaultConfig.debugLogging) {
      logger.debug('AutoScroll: Resetting scroll state');
    }
    setState(prev => ({
      ...prev,
      isUserScrolling: false,
      isAtBottom: true,
      isAutoScrollEnabled: defaultConfig.enabled
    }));
  }, [defaultConfig.debugLogging, defaultConfig.enabled]);

  // Handle auto-scroll when messages change
  useEffect(() => {
    const prevValues = prevValuesRef.current;
    const shouldAutoScroll = 
      state.isAutoScrollEnabled &&
      !state.isUserScrolling &&
      defaultConfig.scrollToBottomOnUpdate;

    // Only log when there are actual changes
    const hasChanges = messagesLength !== prevValues.messagesLength || 
                      isProcessing !== prevValues.isProcessing || 
                      pendingPermission !== prevValues.pendingPermission;
    
    if (hasChanges) {
      logger.debug('AutoScroll: State change detected', {
        messagesChanged: messagesLength !== prevValues.messagesLength,
        processingChanged: isProcessing !== prevValues.isProcessing,
        permissionChanged: pendingPermission !== prevValues.pendingPermission,
        shouldAutoScroll
      });
    }

    // Check if messages were added
    if (messagesLength > prevValues.messagesLength) {
      logger.info(`AutoScroll: Messages increased from ${prevValues.messagesLength} to ${messagesLength}`, {
        shouldAutoScroll,
        isAutoScrollEnabled: state.isAutoScrollEnabled,
        isUserScrolling: state.isUserScrolling,
        scrollToBottomOnUpdate: defaultConfig.scrollToBottomOnUpdate
      });

      if (shouldAutoScroll) {
        logger.info('AutoScroll: Scrolling to bottom due to new messages');
        scrollToBottom();
      }

      setState(prev => ({
        ...prev,
        messageCount: messagesLength
      }));
    }

    // Check if processing state changed
    if (isProcessing !== prevValues.isProcessing) {
      logger.info(`AutoScroll: Processing state changed from ${prevValues.isProcessing} to ${isProcessing}`, {
        shouldAutoScroll,
        willScrollToBottom: shouldAutoScroll && isProcessing
      });

      if (shouldAutoScroll && isProcessing) {
        // When processing starts, ensure we're at the bottom to see updates
        logger.info('AutoScroll: Scrolling to bottom due to processing start');
        scrollToBottom();
      }
    }

    // Check if permission state changed
    if (pendingPermission !== prevValues.pendingPermission) {
      logger.info(`AutoScroll: Permission state changed from ${prevValues.pendingPermission} to ${pendingPermission}`, {
        shouldAutoScroll,
        willScrollToBottom: shouldAutoScroll && pendingPermission
      });

      if (shouldAutoScroll && pendingPermission) {
        // When permission prompt appears, scroll to bottom to show it
        logger.info('AutoScroll: Scrolling to bottom due to permission prompt');
        scrollToBottom();
      }
    }

    // Update previous values
    prevValuesRef.current = {
      messagesLength,
      isProcessing,
      pendingPermission
    };
  }, [
    messagesLength, 
    isProcessing, 
    pendingPermission, 
    state.isAutoScrollEnabled, 
    state.isUserScrolling,
    defaultConfig.scrollToBottomOnUpdate,
    defaultConfig.debugLogging,
    scrollToBottom
  ]);

  // Auto-enable scroll when processing starts (if user hasn't explicitly disabled)
  useEffect(() => {
    if (isProcessing && !state.isUserScrolling) {
      if (defaultConfig.debugLogging) {
        logger.debug('AutoScroll: Processing started, enabling auto-scroll');
      }
      enableAutoScroll();
    }
  }, [isProcessing, state.isUserScrolling, enableAutoScroll, defaultConfig.debugLogging]);

  // Reset user scrolling flag after a timeout (they might want to see new messages)
  useEffect(() => {
    if (state.isUserScrolling) {
      const timeout = setTimeout(() => {
        if (defaultConfig.debugLogging) {
          logger.debug('AutoScroll: User scroll timeout, re-enabling auto-scroll');
        }
        setState(prev => ({
          ...prev,
          isUserScrolling: false
        }));
      }, 30000); // 30 seconds timeout

      return () => clearTimeout(timeout);
    }
  }, [state.isUserScrolling, defaultConfig.debugLogging]);

  const controls: AutoScrollControls = useMemo(() => ({
    scrollToBottom,
    enableAutoScroll,
    disableAutoScroll,
    toggleAutoScroll,
    resetScrollState
  }), [scrollToBottom, enableAutoScroll, disableAutoScroll, toggleAutoScroll, resetScrollState]);

  return [state, controls];
}