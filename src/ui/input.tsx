import React from 'react';
import { Box, Text } from 'ink';

interface InputHandlerProps {
  input: string;
  onInputChange: (input: string) => void;
}

const InputHandler: React.FC<InputHandlerProps> = ({ input }) => {
  const inputLines = input.split('\n');
  const hasMultipleLines = inputLines.length > 1;
  
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Claude Code style input box */}
      <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
        <Box>
          <Text color="white" bold>{'>'} </Text>
          <Box flexDirection="column" flexGrow={1}>
            {hasMultipleLines ? (
              inputLines.map((line, index) => (
                <Box key={index}>
                  <Text color="white">
                    {line}
                    {index === inputLines.length - 1 && <Text backgroundColor="white" color="black"> </Text>}
                  </Text>
                </Box>
              ))
            ) : (
              <Text color="white">
                {input}
                <Text backgroundColor="white" color="black"> </Text>
              </Text>
            )}
          </Box>
        </Box>
      </Box>
      
      {/* Input hints - match Claude Code styling */}
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