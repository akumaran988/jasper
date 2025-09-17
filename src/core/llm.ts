import { GoogleGenAI } from '@google/genai';
import { LLMProvider, Message, Tool, AIResponse } from '../types/index.js';
import { getLogger } from '../utils/logger.js';

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private client: GoogleGenAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string = 'gemini-2.0-flash-exp') {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
  }

  async generateResponse(messages: Message[], tools: Tool[]): Promise<AIResponse> {
    const maxRetries = 3;
    let lastError: string = '';
    const logger = getLogger();
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const prompt = this.buildPrompt(messages, tools);
        
        // If this is a retry, add context about the previous failed response
        let finalPrompt = prompt;
        if (attempt > 1) {
          finalPrompt += `\n\nIMPORTANT: Your previous response could not be parsed as valid JSON. Please ensure you respond with ONLY valid JSON in the exact format specified. Do not include any text before or after the JSON. Here was the error: ${lastError}`;
        }
        
        const response = await this.client.models.generateContent({
          model: this.modelName,
          contents: [{
            role: 'user',
            parts: [{ text: finalPrompt }]
          }]
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        logger.debug('LLM raw response', {
          attempt,
          responseLength: text.length,
          responsePreview: text.substring(0, 200) + (text.length > 200 ? '...' : '')
        });

        let parsedResponse: any = {};
        let parseSuccess = false;
        
        try {
          // First try to parse as direct JSON
          parsedResponse = JSON.parse(text);
          parseSuccess = true;
        } catch (parseError) {
          lastError = parseError instanceof Error ? parseError.message : 'Unknown error';
          logger.debug('Direct JSON parsing failed, trying cleanup', { 
            error: lastError,
            textPreview: text.substring(0, 100)
          });
          
          // Try to clean up malformed JSON (common issue with Gemini)
          try {
            // Fix common JSON issues: actual newlines in JSON strings
            let cleanedText = text
              .replace(/\n/g, '\\n')    // Replace actual newlines with escaped ones
              .replace(/\r/g, '\\r')    // Replace actual carriage returns  
              .replace(/\t/g, '\\t')    // Replace actual tabs
              .trim();                  // Remove leading/trailing whitespace
            
            parsedResponse = JSON.parse(cleanedText);
            parseSuccess = true;
            logger.debug('Successfully parsed cleaned JSON');
          } catch (cleanupError) {
            // If cleanup fails, check for markdown code block
            if (text.includes('```json') && text.includes('```')) {
              const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
              if (jsonMatch && jsonMatch[1]) {
                try {
                  parsedResponse = JSON.parse(jsonMatch[1]);
                  parseSuccess = true;
                  logger.debug('Successfully parsed JSON from markdown block');
                } catch (innerError) {
                  logger.debug('All JSON parsing attempts failed');
                  lastError = `Parse failed: ${innerError instanceof Error ? innerError.message : 'Unknown error'}`;
                }
              }
            }
          }
        }

        // If parsing succeeded or this is the final attempt, return the result
        if (parseSuccess) {
          return {
            content: parsedResponse.content || '',
            tool_calls: parsedResponse.tool_calls || [],
            should_continue: parsedResponse.should_continue !== false,
            reasoning: parsedResponse.reasoning
          };
        } else if (attempt === maxRetries) {
          // Final attempt failed, return a recoverable response
          logger.debug('All parsing attempts failed, returning fallback response');
          return {
            content: "I apologize, but I'm having trouble formatting my response correctly. Could you please rephrase your request?",
            tool_calls: [],
            should_continue: false,
            reasoning: "JSON parsing failed after multiple attempts"
          };
        }
        
        // Continue to next attempt
        logger.debug(`Attempt ${attempt} failed, retrying...`);
        
      } catch (error) {
        if (attempt === maxRetries) {
          console.error('Gemini API error:', error);
          throw error;
        }
        logger.debug(`API error on attempt ${attempt}, retrying...`, { error });
      }
    }
    
    // This should never be reached, but just in case
    throw new Error('All retry attempts failed');
  }

  private buildPrompt(messages: Message[], tools: Tool[]): string {
    let prompt = `You are Jasper, a conversational AI development assistant. You can use tools to help users with their development tasks.

Available tools:
${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON. Do not include "ASSISTANT:" or any other prefixes.

Your response must be a single valid JSON object with this exact structure:
{
  "content": "Your response to the user",
  "tool_calls": [
    {
      "id": "unique_id",
      "name": "tool_name",
      "parameters": { "param1": "value1" }
    }
  ],
  "should_continue": true/false,
  "reasoning": "Your reasoning for the actions taken"
}

IMPORTANT: 
- Start your response directly with { and end with }
- No "ASSISTANT:" prefix
- No markdown code blocks
- No additional text
- Just pure JSON

Conversation history:
`;

    messages.forEach(msg => {
      prompt += `${msg.role.toUpperCase()}: ${msg.content}\n`;
      
      // Include structured tool results if present
      if (msg.toolResults && msg.toolResults.length > 0) {
        prompt += `TOOL_RESULTS: [\n`;
        msg.toolResults.forEach(result => {
          prompt += `  {\n`;
          prompt += `    "id": "${result.id}",\n`;
          prompt += `    "success": ${result.success},\n`;
          if (result.success && result.result) {
            prompt += `    "result": ${JSON.stringify(result.result, null, 4)},\n`;
          }
          if (result.error) {
            prompt += `    "error": "${result.error}",\n`;
          }
          if (result.executionTime) {
            prompt += `    "executionTime": ${result.executionTime}\n`;
          }
          prompt += `  },\n`;
        });
        prompt += `]\n`;
      }
    });

    return prompt;
  }
}

export class CustomProvider implements LLMProvider {
  name = 'custom';
  private endpoint: string;
  private headers: Record<string, string>;

  constructor(endpoint: string, apiKey?: string) {
    this.endpoint = endpoint;
    this.headers = {
      'Content-Type': 'application/json',
      ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
    };
  }

  async generateResponse(messages: Message[], tools: Tool[], maxTokens: number = 4000): Promise<AIResponse> {
    try {
      const payload = {
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        })),
        max_tokens: maxTokens,
        response_format: 'json'
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Custom API error: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();
      
      return {
        content: data.content || '',
        tool_calls: data.tool_calls || [],
        should_continue: data.should_continue !== false,
        reasoning: data.reasoning
      };
    } catch (error) {
      console.error('Custom API error:', error);
      throw error;
    }
  }
}