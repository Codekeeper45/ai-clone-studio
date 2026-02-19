import { v4 as uuidv4 } from 'uuid';
import { Message, ParseResult } from '../types';

// ============================================================
// Telegram Export Types
// ============================================================

interface TelegramTextEntity {
  type: string;
  text: string;
}

interface TelegramMessage {
  id: number;
  type: string;
  date: string;
  from?: string;
  from_id?: string;
  text: string | TelegramTextEntity[] | TelegramTextEntity;
  photo?: string;
  file?: string;
  media_type?: string;
  edited?: string;
  forwarded_from?: string;
  reply_to_message_id?: number;
}

interface TelegramExport {
  name?: string;
  type?: string;
  id?: number;
  messages?: TelegramMessage[];
  chats?: {
    list?: TelegramChatExport[];
  } | TelegramChatExport[];
}

interface TelegramChatExport {
  id?: number | string;
  name?: string;
  type?: string;
  messages?: TelegramMessage[];
}

// ============================================================
// ChatParser Service
// ============================================================

export class ChatParser {
  /**
   * Detect the format of chat export content
   */
  detectFormat(content: string): 'telegram' | 'whatsapp' | 'unknown' {
    try {
      // Try parsing as JSON for Telegram
      const parsed = JSON.parse(content);
      const hasRootMessages = Array.isArray(parsed.messages);
      const hasChatsList = Array.isArray(parsed?.chats?.list);
      const hasChatsArray = Array.isArray(parsed?.chats);
      if (hasRootMessages || hasChatsList || hasChatsArray) {
        return 'telegram';
      }
    } catch {
      // Not JSON, check for WhatsApp format
      const whatsappPatterns = [
        /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\]?\s*[-:]?\s*.+:/m,
        /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\s*-\s*.+:/m
      ];

      for (const pattern of whatsappPatterns) {
        if (pattern.test(content)) {
          return 'whatsapp';
        }
      }
    }

    return 'unknown';
  }

  /**
   * Parse Telegram JSON export format
   */
  parseTelegram(jsonContent: string): ParseResult {
    try {
      const data: TelegramExport = JSON.parse(jsonContent);

      const hasRootMessages = Array.isArray(data.messages);
      const hasChatsList = Array.isArray((data.chats as { list?: TelegramChatExport[] } | undefined)?.list);
      const hasChatsArray = Array.isArray(data.chats);

      if (!hasRootMessages && !hasChatsList && !hasChatsArray) {
        return {
          messages: [],
          participants: [],
          dateRange: { start: new Date(), end: new Date() },
          platform: 'telegram',
          error: 'Invalid Telegram export format: missing messages array'
        };
      }

      const sourceMessages = this.extractTelegramMessages(data);

      const messages: Message[] = [];
      const participantsSet = new Set<string>();
      let earliestDate: Date | null = null;
      let latestDate: Date | null = null;

      for (const msg of sourceMessages) {
        try {
          // Parse timestamp
          const dateStr = this.normalizeTelegramDate(msg.date);
          const timestamp = new Date(dateStr);
          if (isNaN(timestamp.getTime())) {
            continue; // Skip invalid dates
          }

          // Update date range
          if (!earliestDate || timestamp < earliestDate) {
            earliestDate = timestamp;
          }
          if (!latestDate || timestamp > latestDate) {
            latestDate = timestamp;
          }

          // Extract sender
          const sender = msg.from || msg.from_id || 'Unknown';
          if (sender !== 'Unknown') {
            participantsSet.add(sender);
          }

          // Extract text content
          let text = '';
          if (typeof msg.text === 'string') {
            text = msg.text;
          } else if (Array.isArray(msg.text)) {
            // Handle array of text entities
            text = msg.text.map(entity => {
              if (typeof entity === 'string') {
                return entity;
              }
              return entity.text || '';
            }).join('');
          } else if (msg.text && typeof msg.text === 'object') {
            // Handle single text entity object
            text = (msg.text as TelegramTextEntity).text || '';
          }

          // Determine message type
          let messageType: 'text' | 'system' | 'media' = 'text';

          if (msg.type !== 'message') {
            messageType = 'system';
            // For system messages, use the type as text if no text provided
            if (!text) {
              text = `[${msg.type}]`;
            }
          } else if (msg.photo || msg.file || msg.media_type) {
            messageType = 'media';
            if (!text) {
              text = `[${msg.media_type || 'media'}]`;
            }
          }

          // Create message object
          const message: Message = {
            id: uuidv4(),
            timestamp,
            sender,
            text: text || '[no content]',
            type: messageType,
            metadata: {
              platform: 'telegram',
              edited: !!msg.edited,
              forwarded: !!msg.forwarded_from,
              replyTo: msg.reply_to_message_id?.toString()
            }
          };

          messages.push(message);
        } catch (msgError) {
          // Skip individual message parsing errors
          console.error('Error parsing Telegram message:', msgError);
          continue;
        }
      }

      // Validate we have messages
      if (messages.length === 0) {
        return {
          messages: [],
          participants: [],
          dateRange: { start: new Date(), end: new Date() },
          platform: 'telegram',
          error: 'No valid messages found in Telegram export'
        };
      }

      // Sort messages by timestamp
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return {
        messages,
        participants: Array.from(participantsSet),
        dateRange: {
          start: earliestDate || new Date(),
          end: latestDate || new Date()
        },
        platform: 'telegram'
      };
    } catch (error) {
      return {
        messages: [],
        participants: [],
        dateRange: { start: new Date(), end: new Date() },
        platform: 'telegram',
        error: `Failed to parse Telegram export: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Parse WhatsApp TXT export format
   */
  parseWhatsApp(txtContent: string): ParseResult {
    try {
      const lines = txtContent.split('\n');
      const messages: Message[] = [];
      const participantsSet = new Set<string>();
      let earliestDate: Date | null = null;
      let latestDate: Date | null = null;

      // WhatsApp message patterns
      const patterns = [
        // [1/1/24, 10:00:00 AM] Sender: Message OR [1/1/24, 10:00:00 AM] System Action
        /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*((?:AM|PM|am|pm)?)\]\s*(?:([^:]+):\s*(.*)|(.*))$/,
        // 1/1/24, 10:00 AM - Sender: Message OR 1/1/24, 10:00 AM - System Action
        /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*((?:AM|PM|am|pm)?)\s*-\s*(?:([^:]+):\s*(.*)|(.*))$/
      ];

      let currentMessage: Message | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        let matched = false;

        // Try each pattern
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            matched = true;

            // Save previous multiline message if exists
            if (currentMessage) {
              messages.push(currentMessage);
            }

            // Extract components based on pattern groups
            // Groups: 1=date, 2=time, 3=ampm, 4=sender(if colon), 5=text(if colon), 6=system_text(if no colon)
            const dateStr = match[1];
            const timeStr = match[2];
            const ampm = match[3];
            let sender = match[4] || '';
            let text = match[5] || match[6] || '';

            // Parse date and time
            const timestamp = this.parseWhatsAppDate(dateStr, timeStr, ampm);
            if (!timestamp || isNaN(timestamp.getTime())) {
              matched = false;
              continue;
            }

            // Update date range
            if (!earliestDate || timestamp < earliestDate) {
              earliestDate = timestamp;
            }
            if (!latestDate || timestamp > latestDate) {
              latestDate = timestamp;
            }

            sender = sender.trim();
            text = text.trim();

            // Detect system messages
            const isExplicitSystemText = !match[4] && !!match[6];
            const isKnownSystemNotice = !sender && this.isWhatsAppSystemNotice(text);
            const isSystemMessage = isExplicitSystemText || isKnownSystemNotice;

            const messageType: 'text' | 'system' | 'media' = isSystemMessage ? 'system' :
              (text.includes('<attached:') || text.includes('image omitted') ||
               text.includes('video omitted') || text.includes('audio omitted') ||
               text.includes('document omitted') || text.includes('sticker omitted')) ? 'media' : 'text';

            if (sender && !isSystemMessage) {
              participantsSet.add(sender);
            }

            // Create new message
            currentMessage = {
              id: uuidv4(),
              timestamp,
              sender: isSystemMessage ? 'System' : (sender || 'Unknown'),
              text: text || '[no content]',
              type: messageType,
              metadata: {
                platform: 'whatsapp'
              }
            };

            break;
          }
        }

        // If no pattern matched, this is a continuation of previous message (multiline)
        if (!matched && currentMessage) {
          currentMessage.text += '\n' + line;
        }
      }

      // Add the last message if exists
      if (currentMessage) {
        messages.push(currentMessage);
      }

      // Validate we have messages
      if (messages.length === 0) {
        return {
          messages: [],
          participants: [],
          dateRange: { start: new Date(), end: new Date() },
          platform: 'whatsapp',
          error: 'No valid messages found in WhatsApp export'
        };
      }

      // Sort messages by timestamp
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return {
        messages,
        participants: Array.from(participantsSet),
        dateRange: {
          start: earliestDate || new Date(),
          end: latestDate || new Date()
        },
        platform: 'whatsapp'
      };
    } catch {
      return {
        messages: [],
        participants: [],
        dateRange: { start: new Date(), end: new Date() },
        platform: 'whatsapp',
        error: 'Failed to parse WhatsApp export'
      };
    }
  }

  /**
   * Parse WhatsApp date and time strings
   */
  private parseWhatsAppDate(dateStr: string, timeStr: string, ampm: string): Date | null {
    try {
      // Parse date components (m/d/yy or m/d/yyyy)
      const dateParts = dateStr.split('/').map(p => parseInt(p, 10));
      if (dateParts.length !== 3) return null;

      const [month, day, yearRaw] = dateStr.split('/').map(p => parseInt(p, 10));
      let year = yearRaw;

      // Handle 2-digit years
      if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }

      // Parse time components
      const timeParts = timeStr.split(':').map(p => parseInt(p, 10));
      if (timeParts.length < 2) return null;

      let hours = timeParts[0];
      const minutes = timeParts[1];
      const seconds = timeParts.length > 2 ? timeParts[2] : 0;

      // Handle AM/PM
      if (ampm) {
        const isPM = ampm.toLowerCase() === 'pm';
        if (isPM && hours !== 12) {
          hours += 12;
        } else if (!isPM && hours === 12) {
          hours = 0;
        }
      }

      // Create date object (month is 0-indexed in JavaScript)
      const date = new Date(year, month - 1, day, hours, minutes, seconds);

      return date;
    } catch {
      return null;
    }
  }

  private normalizeTelegramDate(dateString: string): string {
    const trimmed = (dateString || '').trim();
    if (!trimmed) {
      return trimmed;
    }

    // Preserve existing timezone info (Z, +HH:MM, -HH:MM, +HHMM, -HHMM).
    const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
    return hasTimezone ? trimmed : `${trimmed}Z`;
  }

  private extractTelegramMessages(data: TelegramExport): TelegramMessage[] {
    const result: TelegramMessage[] = [];

    if (Array.isArray(data.messages)) {
      result.push(...data.messages);
    }

    const chatsContainer = data.chats;
    if (Array.isArray(chatsContainer)) {
      for (const chat of chatsContainer) {
        if (Array.isArray(chat?.messages)) {
          result.push(...chat.messages);
        }
      }
    } else if (chatsContainer && Array.isArray(chatsContainer.list)) {
      for (const chat of chatsContainer.list) {
        if (Array.isArray(chat?.messages)) {
          result.push(...chat.messages);
        }
      }
    }

    return result;
  }

  private isWhatsAppSystemNotice(text: string): boolean {
    const normalized = text.trim();
    const systemPatterns = [
      /^Messages and calls are end-to-end encrypted\.?$/i,
      /^This message was deleted\.?$/i,
      /^.+ changed the subject to .+$/i,
      /^.+ created group .+$/i,
      /^.+ added .+$/i,
      /^.+ removed .+$/i,
      /^.+ left$/i,
      /^.+ joined using this group's invite link$/i,
      /^You were added$/i,
      /^You were removed$/i,
    ];

    return systemPatterns.some((pattern) => pattern.test(normalized));
  }

  /**
   * Merge multiple parse results into one
   */
  mergeFiles(results: ParseResult[]): ParseResult {
    try {
      if (results.length === 0) {
        return {
          messages: [],
          participants: [],
          dateRange: { start: new Date(), end: new Date() },
          platform: 'telegram',
          error: 'No parse results to merge'
        };
      }

      // Filter out results with errors
      const validResults = results.filter(r => !r.error && r.messages.length > 0);

      if (validResults.length === 0) {
        return {
          messages: [],
          participants: [],
          dateRange: { start: new Date(), end: new Date() },
          platform: results[0].platform,
          error: 'All parse results contain errors or no messages'
        };
      }

      // Merge all messages
      const allMessages: Message[] = [];
      const participantsSet = new Set<string>();
      let earliestDate: Date | null = null;
      let latestDate: Date | null = null;

      for (const result of validResults) {
        // Add messages
        allMessages.push(...result.messages);

        // Merge participants
        result.participants.forEach(p => participantsSet.add(p));

        // Update date range
        if (!earliestDate || result.dateRange.start < earliestDate) {
          earliestDate = result.dateRange.start;
        }
        if (!latestDate || result.dateRange.end > latestDate) {
          latestDate = result.dateRange.end;
        }
      }

      // Sort all messages by timestamp
      allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Determine platform (use first valid result's platform)
      const platform = validResults[0].platform;

      return {
        messages: allMessages,
        participants: Array.from(participantsSet),
        dateRange: {
          start: earliestDate || new Date(),
          end: latestDate || new Date()
        },
        platform
      };
    } catch (error) {
      return {
        messages: [],
        participants: [],
        dateRange: { start: new Date(), end: new Date() },
        platform: 'telegram',
        error: `Failed to merge files: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Convenience method to auto-detect format and parse
   */
  parseFile(content: string, filename: string): ParseResult {
    // Try to detect from filename first
    const lowerFilename = filename.toLowerCase();
    let detectedFormat = this.detectFormat(content);

    // Override detection if filename gives clear indication
    if (lowerFilename.endsWith('.json') && detectedFormat === 'unknown') {
      detectedFormat = 'telegram';
    } else if (lowerFilename.endsWith('.txt') && detectedFormat === 'unknown') {
      detectedFormat = 'whatsapp';
    }

    switch (detectedFormat) {
      case 'telegram':
        return this.parseTelegram(content);
      case 'whatsapp':
        return this.parseWhatsApp(content);
      default:
        return {
          messages: [],
          participants: [],
          dateRange: { start: new Date(), end: new Date() },
          platform: 'telegram',
          error: `Unable to detect chat format for file: ${filename}`
        };
    }
  }
}

// Export singleton instance
export const chatParser = new ChatParser();
