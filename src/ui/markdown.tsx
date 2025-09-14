import React from 'react';
import { Box, Text } from 'ink';
import { marked } from 'marked';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Parse markdown tokens
  const tokens = marked.lexer(content);
  
  const renderToken = (token: any, index: number): JSX.Element | null => {
    switch (token.type) {
      case 'paragraph':
        return (
          <Box key={index} flexDirection="column" marginBottom={0}>
            <Text>{renderInlineTokens(token.tokens)}</Text>
          </Box>
        );
      
      case 'heading':
        const headingSymbol = '#'.repeat(token.depth);
        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Text bold color="cyan">
              {headingSymbol} {token.text}
            </Text>
          </Box>
        );
      
      case 'code':
        const codeLines = token.text.split('\n');
        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Box marginLeft={2} paddingX={1} borderStyle="single" borderColor="gray">
              <Box flexDirection="column">
                {token.lang && (
                  <Text color="gray" dimColor>{token.lang}</Text>
                )}
                {codeLines.map((line: string, lineIndex: number) => (
                  <Text key={lineIndex} color="green">
                    {line || ' '}
                  </Text>
                ))}
              </Box>
            </Box>
          </Box>
        );
      
      case 'blockquote':
        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Box marginLeft={2}>
              <Text color="gray">│ </Text>
              <Text color="yellow">{token.text}</Text>
            </Box>
          </Box>
        );
      
      case 'list':
        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            {token.items.map((item: any, itemIndex: number) => (
              <Box key={itemIndex} marginLeft={2}>
                <Text color="white">
                  {token.ordered ? `${itemIndex + 1}. ` : '• '}
                </Text>
                <Text>{renderInlineTokens(item.tokens)}</Text>
              </Box>
            ))}
          </Box>
        );
      
      case 'hr':
        return (
          <Box key={index} marginBottom={1}>
            <Text color="gray">─────────────────────────────────────────</Text>
          </Box>
        );
      
      case 'space':
        return <Box key={index} />;
      
      default:
        // Fallback for unknown tokens
        return (
          <Box key={index} marginBottom={1}>
            <Text>{token.raw || token.text || ''}</Text>
          </Box>
        );
    }
  };
  
  const renderInlineTokens = (tokens: any[]): JSX.Element[] => {
    if (!tokens) return [];
    
    return tokens.map((token, index) => {
      switch (token.type) {
        case 'text':
          return <Text key={index}>{token.text}</Text>;
        
        case 'strong':
          // Handle nested tokens within bold text
          const strongContent = token.tokens ? renderInlineTokens(token.tokens) : token.text;
          return <Text key={index} bold>{strongContent}</Text>;
        
        case 'em':
          // Handle nested tokens within italic text
          const emContent = token.tokens ? renderInlineTokens(token.tokens) : token.text;
          return <Text key={index} italic>{emContent}</Text>;
        
        case 'codespan':
          return (
            <Text key={index} backgroundColor="gray" color="green">
              {token.text}
            </Text>
          );
        
        case 'link':
          return (
            <Text key={index} color="blue" underline>
              {token.text}
            </Text>
          );
        
        case 'del':
          // Handle nested tokens within strikethrough text
          const delContent = token.tokens ? renderInlineTokens(token.tokens) : token.text;
          return (
            <Text key={index} strikethrough>
              {delContent}
            </Text>
          );
        
        default:
          return <Text key={index}>{token.raw || token.text || ''}</Text>;
      }
    });
  };
  
  // Check if content likely contains markdown
  const hasMarkdown = content.includes('**') || content.includes('*') || 
                     content.includes('#') || content.includes('`') || 
                     content.includes('- ') || content.includes('> ') ||
                     content.includes('1. ') || content.includes('```');
                     
  // Handle plain text (no markdown)
  if (!hasMarkdown) {
    return <Text>{content}</Text>;
  }
  
  try {
    return (
      <Box flexDirection="column">
        {tokens.map(renderToken)}
      </Box>
    );
  } catch (error) {
    // Fallback to plain text if markdown parsing fails
    console.warn('Markdown parsing failed:', error);
    return <Text>{content}</Text>;
  }
};

export default MarkdownRenderer;