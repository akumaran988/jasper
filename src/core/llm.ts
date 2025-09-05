import { GoogleGenAI } from '@google/genai';
import { LLMProvider, Message, Tool, AIResponse } from '../types/index.js';

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private client: GoogleGenAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string = 'gemini-2.0-flash-exp') {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
  }

  async generateResponse(messages: Message[], tools: Tool[]): Promise<AIResponse> {
    try {
      const prompt = this.buildPrompt(messages, tools);
      
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }]
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

      let parsedResponse: any = {};
      try {
        // First try to parse as direct JSON
        parsedResponse = JSON.parse(text);
      } catch {
        // If that fails, check for nested JSON in markdown code block
        if (text.includes('```json') && text.includes('```')) {
          const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              parsedResponse = JSON.parse(jsonMatch[1]);
            } catch (innerError) {
              parsedResponse = { content: text };
            }
          } else {
            parsedResponse = { content: text };
          }
        } else {
          parsedResponse = { content: text };
        }
      }

      return {
        content: parsedResponse.content || text,
        tool_calls: parsedResponse.tool_calls || [],
        should_continue: parsedResponse.should_continue !== false,
        reasoning: parsedResponse.reasoning
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
  }

  private buildPrompt(messages: Message[], tools: Tool[]): string {
    let prompt = `You are Jasper, a conversational AI development assistant. You can use tools to help users with their development tasks.

Available tools:
${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

Respond in JSON format with the following structure:
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

Conversation history:
`;

    messages.forEach(msg => {
      prompt += `${msg.role.toUpperCase()}: ${msg.content}\n`;
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