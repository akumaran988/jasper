import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { getLogger } from '../utils/logger.js';

// Streaming states (gemini-cli inspired)
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
  Processing = 'processing',
  Error = 'error'
}

// Real-time update types
export interface StreamingMessage {
  id: string;
  content: string;
  timestamp: Date;
  isPartial: boolean;
  type: 'text' | 'tool_call' | 'error';
}

export interface StreamingContextValue {
  state: StreamingState;
  currentMessage?: StreamingMessage;
  isStreaming: boolean;
  bufferSize: number;
  updateCount: number;
  
  // Control functions
  startStreaming: () => void;
  stopStreaming: () => void;
  updateState: (state: StreamingState) => void;
  appendToMessage: (content: string) => void;
  completeMessage: () => void;
  resetStream: () => void;
}

const StreamingContext = createContext<StreamingContextValue | undefined>(undefined);

export const useStreamingContext = (): StreamingContextValue => {
  const context = useContext(StreamingContext);
  if (!context) {
    throw new Error('useStreamingContext must be used within a StreamingProvider');
  }
  return context;
};

interface StreamingProviderProps {
  children: React.ReactNode;
  onMessageComplete?: (message: StreamingMessage) => void;
  onStateChange?: (state: StreamingState) => void;
}

export const StreamingProvider: React.FC<StreamingProviderProps> = ({
  children,
  onMessageComplete,
  onStateChange
}) => {
  const logger = getLogger();
  const [state, setState] = useState<StreamingState>(StreamingState.Idle);
  const [currentMessage, setCurrentMessage] = useState<StreamingMessage | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [updateCount, setUpdateCount] = useState(0);
  
  const bufferRef = useRef<string>('');
  const messageIdRef = useRef<number>(0);

  // Enhanced state management with logging
  const updateState = useCallback((newState: StreamingState) => {
    const previousState = state;
    if (previousState !== newState) {
      logger.info(`StreamingContext: State change ${previousState} -> ${newState}`);
      setState(newState);
      onStateChange?.(newState);
    }
  }, [state, onStateChange, logger]);

  const startStreaming = useCallback(() => {
    logger.info('StreamingContext: Starting stream');
    setIsStreaming(true);
    updateState(StreamingState.Responding);
    bufferRef.current = '';
    setUpdateCount(0);
    
    // Create new partial message
    const messageId = `stream-${++messageIdRef.current}-${Date.now()}`;
    const newMessage: StreamingMessage = {
      id: messageId,
      content: '',
      timestamp: new Date(),
      isPartial: true,
      type: 'text'
    };
    setCurrentMessage(newMessage);
  }, [updateState, logger]);

  const appendToMessage = useCallback((content: string) => {
    if (!isStreaming) return;
    
    bufferRef.current += content;
    setUpdateCount(prev => prev + 1);
    
    setCurrentMessage(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        content: bufferRef.current,
        timestamp: new Date() // Update timestamp for real-time tracking
      };
    });
  }, [isStreaming]);

  const completeMessage = useCallback(() => {
    if (!currentMessage) return;
    
    logger.info('StreamingContext: Completing message', {
      messageId: currentMessage.id,
      contentLength: currentMessage.content.length,
      updateCount
    });

    const finalMessage: StreamingMessage = {
      ...currentMessage,
      isPartial: false,
      timestamp: new Date()
    };

    onMessageComplete?.(finalMessage);
    setCurrentMessage(undefined);
    setIsStreaming(false);
    updateState(StreamingState.Idle);
    bufferRef.current = '';
  }, [currentMessage, updateCount, onMessageComplete, updateState, logger]);

  const stopStreaming = useCallback(() => {
    logger.info('StreamingContext: Stopping stream');
    if (currentMessage && isStreaming) {
      completeMessage();
    } else {
      setIsStreaming(false);
      setCurrentMessage(undefined);
      updateState(StreamingState.Idle);
      bufferRef.current = '';
    }
  }, [currentMessage, isStreaming, completeMessage, updateState, logger]);

  const resetStream = useCallback(() => {
    logger.info('StreamingContext: Resetting stream');
    setIsStreaming(false);
    setCurrentMessage(undefined);
    setState(StreamingState.Idle);
    setUpdateCount(0);
    bufferRef.current = '';
  }, [logger]);

  // Auto-cleanup for stale streams
  useEffect(() => {
    if (isStreaming && currentMessage) {
      const timeout = setTimeout(() => {
        logger.warn('StreamingContext: Auto-cleanup stale stream');
        stopStreaming();
      }, 30000); // 30 second timeout

      return () => clearTimeout(timeout);
    }
  }, [isStreaming, currentMessage, stopStreaming, logger]);

  const contextValue: StreamingContextValue = {
    state,
    currentMessage,
    isStreaming,
    bufferSize: bufferRef.current.length,
    updateCount,
    startStreaming,
    stopStreaming,
    updateState,
    appendToMessage,
    completeMessage,
    resetStream
  };

  return (
    <StreamingContext.Provider value={contextValue}>
      {children}
    </StreamingContext.Provider>
  );
};