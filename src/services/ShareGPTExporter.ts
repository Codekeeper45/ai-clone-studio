import { Message, ShareGPTConversation, ShareGPTMessage, ExportMetadata } from '../types';

/**
 * ShareGPTExporter - Exports filtered messages to ShareGPT JSONL format
 *
 * This service handles the conversion of chat messages into the ShareGPT format,
 * which is commonly used for fine-tuning language models. It groups messages into
 * conversations with alternating human/assistant roles.
 */
export class ShareGPTExporter {
  private messages: Message[];
  private targetUser: string;
  private metadata: ExportMetadata | null;

  /**
   * Creates a new ShareGPTExporter instance
   * @param messages - Array of Message objects to export
   * @param targetUser - The user whose messages should be marked as "assistant"
   */
  constructor(messages: Message[], targetUser: string) {
    this.messages = messages;
    this.targetUser = targetUser;
    this.metadata = null;
  }

  /**
   * Converts messages into ShareGPT conversation format
   *
   * Algorithm:
   * 1. Filter out system and media messages
   * 2. Sort messages chronologically
   * 3. Group messages into conversations with alternating roles
   * 4. Merge consecutive messages from the same role
   * 5. Ensure each conversation has at least one human and one assistant message
   *
   * @returns Array of ShareGPTConversation objects
   */
  convertToShareGPT(): ShareGPTConversation[] {
    // Filter out system and media messages, keep only text messages
    const textMessages = this.messages.filter(msg => msg.type === 'text');

    // Sort messages chronologically
    const sortedMessages = [...textMessages].sort(
      (a, b) => this.timestampToMs(a.timestamp) - this.timestampToMs(b.timestamp)
    );

    if (sortedMessages.length === 0) {
      return [];
    }

    const conversations: ShareGPTConversation[] = [];
    let currentConversation: ShareGPTMessage[] = [];
    let lastRole: 'human' | 'gpt' | null = null;

    for (const message of sortedMessages) {
      const role: 'human' | 'gpt' =
        message.sender === this.targetUser ? 'gpt' : 'human';

      // If this is a new conversation (starts with human message after gap or first message)
      if (currentConversation.length === 0) {
        // Start new conversation, prefer to start with human message
        if (role === 'human') {
          currentConversation.push({
            from: role,
            value: message.text
          });
          lastRole = role;
        }
        // If first message is assistant, skip it (conversations should start with human)
        continue;
      }

      // If same role as last message, merge them
      if (role === lastRole) {
        const lastMessage = currentConversation[currentConversation.length - 1];
        lastMessage.value += '\n' + message.text;
      } else {
        // Different role - add new message
        currentConversation.push({
          from: role,
          value: message.text
        });
        lastRole = role;

        // Check if we should end this conversation
        // A complete conversation has both human and assistant messages
        // We'll end conversations when they reach a natural size (e.g., 4+ exchanges)
        if (currentConversation.length >= 4) {
          // Ensure conversation ends with assistant message and has both roles
          const hasHuman = currentConversation.some(msg => msg.from === 'human');
          const hasAssistant = currentConversation.some(msg => msg.from === 'gpt');

          if (hasHuman && hasAssistant && role === 'gpt') {
            conversations.push({
              conversations: [...currentConversation]
            });
            currentConversation = [];
            lastRole = null;
          }
        }
      }
    }

    // Add remaining conversation if it's valid
    if (currentConversation.length > 0) {
      const hasHuman = currentConversation.some(msg => msg.from === 'human');
      const hasAssistant = currentConversation.some(msg => msg.from === 'gpt');

      if (hasHuman && hasAssistant) {
        conversations.push({
          conversations: currentConversation
        });
      }
    }

    return conversations;
  }

  private timestampToMs(timestamp: Date | string): number {
    const normalized = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const ms = normalized.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }

  /**
   * Generates JSONL (JSON Lines) format output
   *
   * Format:
   * - First line: Metadata comment (if metadata is set)
   * - Subsequent lines: One ShareGPTConversation per line as JSON
   *
   * @returns JSONL formatted string
   */
  generateJSONL(): string {
    const conversations = this.convertToShareGPT();
    const lines: string[] = [];

    // Add metadata comment as first line if metadata exists
    if (this.metadata) {
      lines.push(`// metadata: ${JSON.stringify(this.metadata)}`);
    }

    // Add each conversation as a separate JSON line
    for (const conversation of conversations) {
      lines.push(JSON.stringify(conversation));
    }

    return lines.join('\n');
  }

  /**
   * Stores metadata to be included in the export
   * @param metadata - ExportMetadata object containing dataset information
   */
  addMetadata(metadata: ExportMetadata): void {
    this.metadata = metadata;
  }

  /**
   * Triggers download of the JSONL file
   * @param filename - Optional custom filename (auto-generated if not provided)
   */
  downloadFile(filename?: string): void {
    const finalFilename = filename || ShareGPTExporter.generateFilename(this.targetUser);
    const content = this.generateJSONL();

    // Create blob with JSONL content
    const blob = new Blob([content], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);

    // Create temporary download link and trigger click
    const link = document.createElement('a');
    link.href = url;
    link.download = finalFilename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Generates a standardized filename for the export
   * @param targetUser - The target user's name
   * @returns Formatted filename string
   */
  static generateFilename(targetUser: string): string {
    // Sanitize targetUser - replace spaces and special characters with underscores
    const sanitizedUser = targetUser
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    // Generate timestamp in YYYYMMDD_HHMMSS format
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;

    return `${sanitizedUser}_clone_dataset_${timestamp}.jsonl`;
  }
}
