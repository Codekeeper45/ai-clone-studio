import { describe, it, expect } from 'vitest';
import { ChatParser } from './ChatParser';
import { ParseResult } from '../types';

describe('ChatParser', () => {
  const parser = new ChatParser();

  describe('detectFormat', () => {
    it('should detect Telegram JSON format', () => {
      const content = JSON.stringify({
        name: 'Test Chat',
        type: 'personal_chat',
        messages: []
      });
      expect(parser.detectFormat(content)).toBe('telegram');
    });

    it('should detect Telegram JSON format with chats.list', () => {
      const content = JSON.stringify({
        chats: {
          list: [
            { name: 'Chat 1', messages: [] }
          ]
        }
      });
      expect(parser.detectFormat(content)).toBe('telegram');
    });

    it('should detect WhatsApp format with brackets and AM/PM', () => {
      const content = '[1/15/24, 10:30:00 AM] Alice: Hello there';
      expect(parser.detectFormat(content)).toBe('whatsapp');
    });

    it('should detect WhatsApp format without brackets', () => {
      const content = '1/15/24, 10:30 AM - Bob: Hey';
      expect(parser.detectFormat(content)).toBe('whatsapp');
    });

    it('should detect WhatsApp format without AM/PM', () => {
      const content = '[1/15/24, 22:30:00] Alice: Good evening';
      expect(parser.detectFormat(content)).toBe('whatsapp');
    });

    it('should return unknown for empty content', () => {
      expect(parser.detectFormat('')).toBe('unknown');
    });

    it('should return unknown for invalid content', () => {
      expect(parser.detectFormat('This is just plain text')).toBe('unknown');
    });

    it('should return unknown for malformed JSON', () => {
      expect(parser.detectFormat('{"incomplete": ')).toBe('unknown');
    });

    it('should return unknown for JSON without messages array', () => {
      const content = JSON.stringify({ name: 'Test', data: {} });
      expect(parser.detectFormat(content)).toBe('unknown');
    });
  });

  describe('parseTelegram', () => {
    it('should parse Telegram export with chats.list structure', () => {
      const telegramData = {
        about: 'Telegram chat export',
        chats: {
          list: [
            {
              name: 'Chat A',
              messages: [
                {
                  id: 1,
                  type: 'message',
                  date: '2024-01-15T10:30:00',
                  from: 'Alice',
                  text: 'From chat A'
                }
              ]
            },
            {
              name: 'Chat B',
              messages: [
                {
                  id: 2,
                  type: 'message',
                  date: '2024-01-15T10:35:00',
                  from: 'Bob',
                  text: 'From chat B'
                }
              ]
            }
          ]
        }
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.error).toBeUndefined();
      expect(result.platform).toBe('telegram');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].text).toBe('From chat A');
      expect(result.messages[1].text).toBe('From chat B');
      expect(result.participants).toContain('Alice');
      expect(result.participants).toContain('Bob');
    });

    it('should parse Telegram export with chats array structure', () => {
      const telegramData = {
        chats: [
          {
            name: 'Chat A',
            messages: [
              {
                id: 1,
                type: 'message',
                date: '2024-01-15T10:30:00',
                from: 'Alice',
                text: 'Hello'
              }
            ]
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.error).toBeUndefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe('Hello');
      expect(result.participants).toContain('Alice');
    });

    it('should parse valid Telegram export with text messages', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        id: 123456,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            from_id: 'user123',
            text: 'Hello, how are you?'
          },
          {
            id: 2,
            type: 'message',
            date: '2024-01-15T10:31:00',
            from: 'Bob',
            from_id: 'user456',
            text: 'I am doing great, thanks!'
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.error).toBeUndefined();
      expect(result.platform).toBe('telegram');
      expect(result.messages).toHaveLength(2);
      expect(result.participants).toHaveLength(2);
      expect(result.participants).toContain('Alice');
      expect(result.participants).toContain('Bob');

      expect(result.messages[0].sender).toBe('Alice');
      expect(result.messages[0].text).toBe('Hello, how are you?');
      expect(result.messages[0].type).toBe('text');
      expect(result.messages[0].metadata?.platform).toBe('telegram');

      expect(result.messages[1].sender).toBe('Bob');
      expect(result.messages[1].text).toBe('I am doing great, thanks!');
    });

    it('should handle text as array of entities', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            text: [
              { type: 'plain', text: 'Hello ' },
              { type: 'bold', text: 'world' },
              { type: 'plain', text: '!' }
            ]
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.error).toBeUndefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe('Hello world!');
    });

    it('should handle text as single entity object', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            text: { type: 'plain', text: 'Simple text' }
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.error).toBeUndefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe('Simple text');
    });

    it('should handle media messages', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            photo: 'photo.jpg',
            media_type: 'photo',
            text: 'Check this out!'
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].type).toBe('media');
      expect(result.messages[0].text).toBe('Check this out!');
    });

    it('should handle media messages without text', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            file: 'document.pdf',
            media_type: 'file',
            text: ''
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].type).toBe('media');
      expect(result.messages[0].text).toBe('[file]');
    });

    it('should handle system messages', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'service',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            text: ''
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].type).toBe('system');
      expect(result.messages[0].text).toBe('[service]');
    });

    it('should handle edited and forwarded messages', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            text: 'Edited message',
            edited: '2024-01-15T10:35:00'
          },
          {
            id: 2,
            type: 'message',
            date: '2024-01-15T10:40:00',
            from: 'Bob',
            text: 'Forwarded content',
            forwarded_from: 'Charlie'
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].metadata?.edited).toBe(true);
      expect(result.messages[0].metadata?.forwarded).toBe(false);
      expect(result.messages[1].metadata?.edited).toBe(false);
      expect(result.messages[1].metadata?.forwarded).toBe(true);
    });

    it('should handle reply references', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            text: 'Question?',
            reply_to_message_id: 5
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].metadata?.replyTo).toBe('5');
    });

    it('should sort messages by timestamp', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 3,
            type: 'message',
            date: '2024-01-15T10:40:00',
            from: 'Charlie',
            text: 'Third'
          },
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            text: 'First'
          },
          {
            id: 2,
            type: 'message',
            date: '2024-01-15T10:35:00',
            from: 'Bob',
            text: 'Second'
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].text).toBe('First');
      expect(result.messages[1].text).toBe('Second');
      expect(result.messages[2].text).toBe('Third');
    });

    it('should calculate correct date range', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            text: 'First'
          },
          {
            id: 2,
            type: 'message',
            date: '2024-01-20T14:45:00',
            from: 'Bob',
            text: 'Last'
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.dateRange.start.toISOString()).toBe('2024-01-15T10:30:00.000Z');
      expect(result.dateRange.end.toISOString()).toBe('2024-01-20T14:45:00.000Z');
    });

    it('should skip messages with invalid dates', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: 'invalid-date',
            from: 'Alice',
            text: 'Should be skipped'
          },
          {
            id: 2,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Bob',
            text: 'Valid message'
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe('Valid message');
    });

    it('should correctly parse Telegram timestamps with explicit timezone offsets', () => {
      const telegramData = {
        name: 'Offset Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00+03:00',
            from: 'Alice',
            text: 'Offset message',
          },
          {
            id: 2,
            type: 'message',
            date: '2024-01-15T08:00:00Z',
            from: 'Bob',
            text: 'UTC message',
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.error).toBeUndefined();
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].text).toBe('Offset message');
      expect(result.messages[0].timestamp.toISOString()).toBe('2024-01-15T07:30:00.000Z');
    });

    it('should handle empty messages array', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: []
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.error).toBe('No valid messages found in Telegram export');
      expect(result.messages).toHaveLength(0);
      expect(result.participants).toHaveLength(0);
    });

    it('should handle missing messages field', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat'
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.error).toBe('Invalid Telegram export format: missing messages array');
      expect(result.messages).toHaveLength(0);
    });

    it('should handle malformed JSON', () => {
      const result = parser.parseTelegram('{"incomplete": ');

      expect(result.error).toContain('Failed to parse Telegram export');
      expect(result.messages).toHaveLength(0);
    });

    it('should handle missing sender information', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            text: 'No sender info'
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].sender).toBe('Unknown');
      expect(result.participants).toHaveLength(0);
    });

    it('should handle array of string entities', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            text: ['Hello', ' ', 'World']
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe('Hello World');
    });

    it('should assign unique UUIDs to messages', () => {
      const telegramData = {
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            text: 'First'
          },
          {
            id: 2,
            type: 'message',
            date: '2024-01-15T10:31:00',
            from: 'Bob',
            text: 'Second'
          }
        ]
      };

      const result = parser.parseTelegram(JSON.stringify(telegramData));

      expect(result.messages[0].id).toBeTruthy();
      expect(result.messages[1].id).toBeTruthy();
      expect(result.messages[0].id).not.toBe(result.messages[1].id);
    });
  });

  describe('parseWhatsApp', () => {
    it('should parse valid WhatsApp format with brackets and AM/PM', () => {
      const content = `[1/15/24, 10:30:00 AM] Alice: Hello there
[1/15/24, 10:31:15 AM] Bob: Hey, how are you?`;

      const result = parser.parseWhatsApp(content);

      expect(result.error).toBeUndefined();
      expect(result.platform).toBe('whatsapp');
      expect(result.messages).toHaveLength(2);
      expect(result.participants).toContain('Alice');
      expect(result.participants).toContain('Bob');
      expect(result.messages[0].text).toBe('Hello there');
      expect(result.messages[1].text).toBe('Hey, how are you?');
    });

    it('should parse WhatsApp format without brackets', () => {
      const content = `1/15/24, 10:30 AM - Alice: Hello
1/15/24, 10:31 AM - Bob: Hi`;

      const result = parser.parseWhatsApp(content);

      expect(result.error).toBeUndefined();
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].text).toBe('Hello');
      expect(result.messages[1].text).toBe('Hi');
    });

    it('should parse WhatsApp format without AM/PM (24h format)', () => {
      const content = `[1/15/24, 22:30:00] Alice: Good evening
[1/15/24, 23:45:00] Bob: Night night`;

      const result = parser.parseWhatsApp(content);

      expect(result.error).toBeUndefined();
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].text).toBe('Good evening');
    });

    it('should handle multiline messages', () => {
      const content = `[1/15/24, 10:30:00 AM] Alice: This is a long message
that spans multiple
lines of text
[1/15/24, 10:35:00 AM] Bob: Short reply`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].text).toBe('This is a long message\nthat spans multiple\nlines of text');
      expect(result.messages[1].text).toBe('Short reply');
    });

    it('should detect system messages', () => {
      const content = `[1/15/24, 10:30:00 AM] Alice changed the subject to "New Topic"
[1/15/24, 10:31:00 AM] Bob created group "Test Group"
[1/15/24, 10:32:00 AM] Alice added Charlie
[1/15/24, 10:33:00 AM] Charlie left`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages).toHaveLength(4);
      expect(result.messages[0].type).toBe('system');
      expect(result.messages[1].type).toBe('system');
      expect(result.messages[2].type).toBe('system');
      expect(result.messages[3].type).toBe('system');
    });

    it('should not classify regular chat text containing added/left/removed as system', () => {
      const content = `[1/15/24, 10:30:00 AM] Alice: I added tests and then left the room
[1/15/24, 10:31:00 AM] Bob: I removed one typo`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].type).toBe('text');
      expect(result.messages[1].type).toBe('text');
      expect(result.participants).toContain('Alice');
      expect(result.participants).toContain('Bob');
    });

    it('should detect media messages', () => {
      const content = `[1/15/24, 10:30:00 AM] Alice: <attached: image.jpg>
[1/15/24, 10:31:00 AM] Bob: image omitted
[1/15/24, 10:32:00 AM] Alice: video omitted
[1/15/24, 10:33:00 AM] Bob: audio omitted`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages).toHaveLength(4);
      expect(result.messages[0].type).toBe('media');
      expect(result.messages[1].type).toBe('media');
      expect(result.messages[2].type).toBe('media');
      expect(result.messages[3].type).toBe('media');
    });

    it('should handle encryption notice as system message', () => {
      const content = `[1/15/24, 10:30:00 AM] Messages and calls are end-to-end encrypted
[1/15/24, 10:31:00 AM] Alice: Hello`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].type).toBe('system');
      expect(result.messages[1].type).toBe('text');
    });

    it('should parse dates correctly with 2-digit years', () => {
      const content = `[1/15/24, 10:30:00 AM] Alice: Test message`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].timestamp.getFullYear()).toBe(2024);
      expect(result.messages[0].timestamp.getMonth()).toBe(0); // January = 0
      expect(result.messages[0].timestamp.getDate()).toBe(15);
    });

    it('should parse dates correctly with 4-digit years', () => {
      const content = `[1/15/2024, 10:30:00 AM] Alice: Test message`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].timestamp.getFullYear()).toBe(2024);
    });

    it('should handle AM/PM time conversion correctly', () => {
      const content = `[1/15/24, 1:30:00 PM] Alice: Afternoon
[1/15/24, 12:00:00 AM] Bob: Midnight
[1/15/24, 12:00:00 PM] Alice: Noon`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages).toHaveLength(3);
      // Parser sorts messages chronologically: Midnight -> Noon -> Afternoon
      expect(result.messages[0].timestamp.getHours()).toBe(0);  // 12 AM = 0
      expect(result.messages[1].timestamp.getHours()).toBe(12); // 12 PM
      expect(result.messages[2].timestamp.getHours()).toBe(13); // 1:30 PM
    });

    it('should sort messages by timestamp', () => {
      const content = `[1/15/24, 10:35:00 AM] Bob: Second
[1/15/24, 10:30:00 AM] Alice: First
[1/15/24, 10:40:00 AM] Charlie: Third`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].text).toBe('First');
      expect(result.messages[1].text).toBe('Second');
      expect(result.messages[2].text).toBe('Third');
    });

    it('should calculate correct date range', () => {
      const content = `[1/15/24, 10:30:00 AM] Alice: First
[1/20/24, 2:45:00 PM] Bob: Last`;

      const result = parser.parseWhatsApp(content);

      expect(result.dateRange.start.getDate()).toBe(15);
      expect(result.dateRange.end.getDate()).toBe(20);
    });

    it('should handle empty content', () => {
      const result = parser.parseWhatsApp('');

      expect(result.error).toBe('No valid messages found in WhatsApp export');
      expect(result.messages).toHaveLength(0);
    });

    it('should handle content with no valid messages', () => {
      const content = 'Just some random text without proper format';

      const result = parser.parseWhatsApp(content);

      expect(result.error).toBe('No valid messages found in WhatsApp export');
      expect(result.messages).toHaveLength(0);
    });

    it('should skip empty lines', () => {
      const content = `[1/15/24, 10:30:00 AM] Alice: First

[1/15/24, 10:31:00 AM] Bob: Second

`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages).toHaveLength(2);
    });

    it('should not include system message senders in participants', () => {
      const content = `[1/15/24, 10:30:00 AM] Alice: Hello
[1/15/24, 10:31:00 AM] Bob created group "Test"
[1/15/24, 10:32:00 AM] Alice: Thanks`;

      const result = parser.parseWhatsApp(content);

      expect(result.participants).toHaveLength(1);
      expect(result.participants).toContain('Alice');
      expect(result.participants).not.toContain('Bob');
    });

    it('should set metadata platform to whatsapp', () => {
      const content = `[1/15/24, 10:30:00 AM] Alice: Test`;

      const result = parser.parseWhatsApp(content);

      expect(result.messages[0].metadata?.platform).toBe('whatsapp');
    });
  });

  describe('mergeFiles', () => {
    it('should merge multiple parse results', () => {
      const result1: ParseResult = {
        messages: [
          {
            id: '1',
            timestamp: new Date('2024-01-15T10:30:00'),
            sender: 'Alice',
            text: 'From file 1',
            type: 'text'
          }
        ],
        participants: ['Alice'],
        dateRange: {
          start: new Date('2024-01-15T10:30:00'),
          end: new Date('2024-01-15T10:30:00')
        },
        platform: 'telegram'
      };

      const result2: ParseResult = {
        messages: [
          {
            id: '2',
            timestamp: new Date('2024-01-16T10:30:00'),
            sender: 'Bob',
            text: 'From file 2',
            type: 'text'
          }
        ],
        participants: ['Bob'],
        dateRange: {
          start: new Date('2024-01-16T10:30:00'),
          end: new Date('2024-01-16T10:30:00')
        },
        platform: 'telegram'
      };

      const merged = parser.mergeFiles([result1, result2]);

      expect(merged.error).toBeUndefined();
      expect(merged.messages).toHaveLength(2);
      expect(merged.participants).toHaveLength(2);
      expect(merged.participants).toContain('Alice');
      expect(merged.participants).toContain('Bob');
    });

    it('should sort merged messages by timestamp', () => {
      const result1: ParseResult = {
        messages: [
          {
            id: '2',
            timestamp: new Date('2024-01-15T10:35:00'),
            sender: 'Bob',
            text: 'Second',
            type: 'text'
          }
        ],
        participants: ['Bob'],
        dateRange: {
          start: new Date('2024-01-15T10:35:00'),
          end: new Date('2024-01-15T10:35:00')
        },
        platform: 'telegram'
      };

      const result2: ParseResult = {
        messages: [
          {
            id: '1',
            timestamp: new Date('2024-01-15T10:30:00'),
            sender: 'Alice',
            text: 'First',
            type: 'text'
          }
        ],
        participants: ['Alice'],
        dateRange: {
          start: new Date('2024-01-15T10:30:00'),
          end: new Date('2024-01-15T10:30:00')
        },
        platform: 'telegram'
      };

      const merged = parser.mergeFiles([result1, result2]);

      expect(merged.messages[0].text).toBe('First');
      expect(merged.messages[1].text).toBe('Second');
    });

    it('should calculate correct merged date range', () => {
      const result1: ParseResult = {
        messages: [
          {
            id: '1',
            timestamp: new Date('2024-01-15T10:30:00'),
            sender: 'Alice',
            text: 'Early',
            type: 'text'
          }
        ],
        participants: ['Alice'],
        dateRange: {
          start: new Date('2024-01-15T10:30:00'),
          end: new Date('2024-01-15T10:30:00')
        },
        platform: 'telegram'
      };

      const result2: ParseResult = {
        messages: [
          {
            id: '2',
            timestamp: new Date('2024-01-20T10:30:00'),
            sender: 'Bob',
            text: 'Late',
            type: 'text'
          }
        ],
        participants: ['Bob'],
        dateRange: {
          start: new Date('2024-01-20T10:30:00'),
          end: new Date('2024-01-20T10:30:00')
        },
        platform: 'telegram'
      };

      const merged = parser.mergeFiles([result1, result2]);

      expect(merged.dateRange.start.getDate()).toBe(15);
      expect(merged.dateRange.end.getDate()).toBe(20);
    });

    it('should filter out results with errors', () => {
      const result1: ParseResult = {
        messages: [],
        participants: [],
        dateRange: { start: new Date(), end: new Date() },
        platform: 'telegram',
        error: 'Some error'
      };

      const result2: ParseResult = {
        messages: [
          {
            id: '1',
            timestamp: new Date('2024-01-15T10:30:00'),
            sender: 'Alice',
            text: 'Valid message',
            type: 'text'
          }
        ],
        participants: ['Alice'],
        dateRange: {
          start: new Date('2024-01-15T10:30:00'),
          end: new Date('2024-01-15T10:30:00')
        },
        platform: 'telegram'
      };

      const merged = parser.mergeFiles([result1, result2]);

      expect(merged.error).toBeUndefined();
      expect(merged.messages).toHaveLength(1);
      expect(merged.messages[0].text).toBe('Valid message');
    });

    it('should handle empty results array', () => {
      const merged = parser.mergeFiles([]);

      expect(merged.error).toBe('No parse results to merge');
      expect(merged.messages).toHaveLength(0);
    });

    it('should handle all results with errors', () => {
      const result1: ParseResult = {
        messages: [],
        participants: [],
        dateRange: { start: new Date(), end: new Date() },
        platform: 'telegram',
        error: 'Error 1'
      };

      const result2: ParseResult = {
        messages: [],
        participants: [],
        dateRange: { start: new Date(), end: new Date() },
        platform: 'whatsapp',
        error: 'Error 2'
      };

      const merged = parser.mergeFiles([result1, result2]);

      expect(merged.error).toBe('All parse results contain errors or no messages');
      expect(merged.messages).toHaveLength(0);
    });

    it('should deduplicate participants', () => {
      const result1: ParseResult = {
        messages: [
          {
            id: '1',
            timestamp: new Date('2024-01-15T10:30:00'),
            sender: 'Alice',
            text: 'Message 1',
            type: 'text'
          }
        ],
        participants: ['Alice', 'Bob'],
        dateRange: {
          start: new Date('2024-01-15T10:30:00'),
          end: new Date('2024-01-15T10:30:00')
        },
        platform: 'telegram'
      };

      const result2: ParseResult = {
        messages: [
          {
            id: '2',
            timestamp: new Date('2024-01-16T10:30:00'),
            sender: 'Bob',
            text: 'Message 2',
            type: 'text'
          }
        ],
        participants: ['Alice', 'Bob', 'Charlie'],
        dateRange: {
          start: new Date('2024-01-16T10:30:00'),
          end: new Date('2024-01-16T10:30:00')
        },
        platform: 'telegram'
      };

      const merged = parser.mergeFiles([result1, result2]);

      expect(merged.participants).toHaveLength(3);
      expect(merged.participants).toContain('Alice');
      expect(merged.participants).toContain('Bob');
      expect(merged.participants).toContain('Charlie');
    });
  });

  describe('parseFile', () => {
    it('should auto-detect and parse Telegram JSON file', () => {
      const content = JSON.stringify({
        name: 'Test Chat',
        type: 'personal_chat',
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'Alice',
            text: 'Hello'
          }
        ]
      });

      const result = parser.parseFile(content, 'chat.json');

      expect(result.error).toBeUndefined();
      expect(result.platform).toBe('telegram');
      expect(result.messages).toHaveLength(1);
    });

    it('should auto-detect and parse WhatsApp TXT file', () => {
      const content = '[1/15/24, 10:30:00 AM] Alice: Hello';

      const result = parser.parseFile(content, 'chat.txt');

      expect(result.error).toBeUndefined();
      expect(result.platform).toBe('whatsapp');
      expect(result.messages).toHaveLength(1);
    });

    it('should use filename extension when content detection fails', () => {
      const content = '{}';

      const result = parser.parseFile(content, 'chat.json');

      expect(result.platform).toBe('telegram');
      // Will have error because it's invalid format, but platform is detected
    });

    it('should handle unknown format', () => {
      const content = 'Random text content';

      const result = parser.parseFile(content, 'unknown.dat');

      expect(result.error).toContain('Unable to detect chat format');
      expect(result.messages).toHaveLength(0);
    });

    it('should prioritize content detection over filename', () => {
      const content = '[1/15/24, 10:30:00 AM] Alice: Hello';

      // Even though filename is .json, content is WhatsApp format
      const result = parser.parseFile(content, 'chat.json');

      expect(result.platform).toBe('whatsapp');
      expect(result.messages).toHaveLength(1);
    });
  });
});
