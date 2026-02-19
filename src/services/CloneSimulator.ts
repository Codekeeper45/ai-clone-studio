import { SimulatorMessage, ModelInfo, ModalConfig } from '../types';

/**
 * CloneSimulator - Service for interacting with a fine-tuned AI model
 * Manages conversation history and API communication with the model endpoint
 */
export class CloneSimulator {
  private modelInfo: ModelInfo;
  private modalConfig: ModalConfig;
  private conversationHistory: SimulatorMessage[];
  private systemPrompt: string;
  private maxHistory: number;

  constructor(modelInfo: ModelInfo, modalConfig: ModalConfig) {
    this.modelInfo = modelInfo;
    this.modalConfig = modalConfig;
    this.conversationHistory = [];
    this.maxHistory = 50;
    this.systemPrompt =
      'You are a person whose communication style has been learned from chat data. ' +
      'Respond naturally and authentically in their style. Be conversational and match ' +
      'their typical message length, tone, and vocabulary.';
  }

  /**
   * Send a message to the AI model and receive a response
   * @param content - The user's message content
   * @returns The assistant's response text
   */
  async sendMessage(content: string): Promise<string> {
    // Add user message to history
    const userMessage: SimulatorMessage = {
      role: 'user',
      content,
      timestamp: new Date(),
    };
    this.conversationHistory.push(userMessage);

    try {
      // Build the API request with full conversation context
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory.map(m => ({
          role: m.role,
          content: m.content,
        })),
      ];

      // Use the actual endpoint from config or the one in modelInfo
      // api.py provides /inference endpoint
      const baseUrl = this.modalConfig.endpoint.replace(/\/+$/, '');
      const url = `${baseUrl}/inference`;

      const requestBody = {
        job_id: this.modelInfo.id, // We'll need to add id to ModelInfo
        messages,
        max_tokens: 500,
        temperature: 0.8,
      };

      // Send request to model endpoint
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Modal-Token': `${this.modalConfig.tokenId}:${this.modalConfig.tokenSecret}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `API request failed with status ${response.status}: ${errorText}`
        );
      }

      // Parse response (OpenAI format)
      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error(
          'Invalid API response format: missing choices[0].message'
        );
      }

      const assistantContent = data.choices[0].message.content;

      if (typeof assistantContent !== 'string') {
        throw new Error('Invalid API response: message content is not a string');
      }

      // Add assistant response to history
      const assistantMessage: SimulatorMessage = {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
      };
      this.conversationHistory.push(assistantMessage);

      // Trim history if it exceeds maxHistory
      // Keep the most recent messages, removing oldest pairs
      if (this.conversationHistory.length > this.maxHistory) {
        const excess = this.conversationHistory.length - this.maxHistory;
        this.conversationHistory.splice(0, excess);
      }

      return assistantContent;
    } catch (error) {
      // Remove the user message from history since the request failed
      this.conversationHistory.pop();

      if (error instanceof Error) {
        throw new Error(`Failed to send message: ${error.message}`);
      }
      throw new Error('Failed to send message: Unknown error occurred');
    }
  }

  /**
   * Get a copy of the conversation history
   * @returns Array of conversation messages
   */
  getConversationHistory(): SimulatorMessage[] {
    // Return a deep copy to prevent external modifications
    return this.conversationHistory.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
  }

  /**
   * Clear the conversation history
   */
  resetConversation(): void {
    this.conversationHistory = [];
  }

  /**
   * Update the system prompt
   * @param prompt - New system prompt string
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * Get the current system prompt
   * @returns Current system prompt string
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }
}
