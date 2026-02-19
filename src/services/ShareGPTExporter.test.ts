import { describe, it, expect } from 'vitest';
import { ShareGPTExporter } from './ShareGPTExporter';
import { Message } from '../types';

describe('ShareGPTExporter', () => {
  const targetUser = 'Alice';
  const mockMessages: Message[] = [
    {
      id: '1',
      timestamp: new Date('2024-01-01T10:00:00Z'),
      sender: 'Bob',
      text: 'Hello Alice',
      type: 'text'
    },
    {
      id: '2',
      timestamp: new Date('2024-01-01T10:01:00Z'),
      sender: 'Alice',
      text: 'Hi Bob!',
      type: 'text'
    },
    {
      id: '3',
      timestamp: new Date('2024-01-01T10:02:00Z'),
      sender: 'Bob',
      text: 'How are you?',
      type: 'text'
    },
    {
      id: '4',
      timestamp: new Date('2024-01-01T10:03:00Z'),
      sender: 'Alice',
      text: 'I am doing great!',
      type: 'text'
    },
    // Consecutive messages from Bob to test merging
    {
      id: '5',
      timestamp: new Date('2024-01-01T10:04:00Z'),
      sender: 'Bob',
      text: 'Good to hear.',
      type: 'text'
    },
    {
      id: '6',
      timestamp: new Date('2024-01-01T10:04:10Z'),
      sender: 'Bob',
      text: 'What are you up to?',
      type: 'text'
    },
    {
      id: '7',
      timestamp: new Date('2024-01-01T10:05:00Z'),
      sender: 'Alice',
      text: 'Just working on AI Clone Studio.',
      type: 'text'
    }
  ];

  it('should correctly map roles (target user -> gpt, others -> human)', () => {
    const exporter = new ShareGPTExporter(mockMessages, targetUser);
    const result = exporter.convertToShareGPT();

    expect(result.length).toBeGreaterThan(0);
    const firstConv = result[0].conversations;

    // Message 1 (Bob) -> human
    expect(firstConv[0].from).toBe('human');
    expect(firstConv[0].value).toBe('Hello Alice');

    // Message 2 (Alice) -> gpt
    expect(firstConv[1].from).toBe('gpt');
    expect(firstConv[1].value).toBe('Hi Bob!');
  });

  it('should merge consecutive messages from the same role', () => {
    const exporter = new ShareGPTExporter(mockMessages, targetUser);
    const result = exporter.convertToShareGPT();

    // Find the human message corresponding to Bob's messages 5 and 6
    const humanMessages = result.flatMap(c => c.conversations).filter(m => m.from === 'human' && m.value.includes('Good to hear.'));

    expect(humanMessages).toHaveLength(1);
    expect(humanMessages[0].value).toBe('Good to hear.\nWhat are you up to?');
  });

  it('should split conversations at natural boundaries (4+ exchanges)', () => {
    const exporter = new ShareGPTExporter(mockMessages, targetUser);
    const result = exporter.convertToShareGPT();

    // The algorithm in ShareGPTExporter splits when length >= 4 AND next is human
    // Or if it ends with gpt at the end of the message array.
    // Our mock data has 7 messages.
    // 1(B), 2(A), 3(B), 4(A) -> first conversation (length 4)
    // 5+6(B), 7(A) -> second conversation

    expect(result).toHaveLength(2);
    expect(result[0].conversations).toHaveLength(4);
    expect(result[1].conversations).toHaveLength(2);
  });

  it('should filter out system and media messages', () => {
    const messagesWithSystem: Message[] = [
      ...mockMessages,
      {
        id: '8',
        timestamp: new Date('2024-01-01T10:06:00Z'),
        sender: 'Alice',
        text: 'System alert',
        type: 'system'
      },
      {
        id: '9',
        timestamp: new Date('2024-01-01T10:07:00Z'),
        sender: 'Alice',
        text: 'image.png',
        type: 'media'
      }
    ];

    const exporter = new ShareGPTExporter(messagesWithSystem, targetUser);
    const result = exporter.convertToShareGPT();

    const allMessages = result.flatMap(c => c.conversations);
    expect(allMessages.map(m => m.value)).not.toContain('System alert');
    expect(allMessages.map(m => m.value)).not.toContain('image.png');
  });

  it('should generate valid JSONL format', () => {
    const exporter = new ShareGPTExporter(mockMessages, targetUser);
    const jsonl = exporter.generateJSONL();

    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);

    // Each line should be valid JSON
    const firstLine = JSON.parse(lines[0]);
    expect(firstLine).toHaveProperty('conversations');
    expect(Array.isArray(firstLine.conversations)).toBe(true);
  });

  it('should include metadata in JSONL if provided', () => {
    const exporter = new ShareGPTExporter(mockMessages, targetUser);
    const metadata = {
      dataset_name: 'test_dataset',
      target_user: 'Alice',
      creation_date: '2024-01-01',
      total_samples: 2,
      platform: 'telegram',
      filters_applied: {
        minMessageLength: 0,
        mergeBurstMessages: false,
        filterLazyResponses: false,
        lazyPatterns: [],
        enableIdentityGuard: false
      }
    };

    exporter.addMetadata(metadata);
    const jsonl = exporter.generateJSONL();

    const lines = jsonl.split('\n');
    expect(lines[0]).toContain('// metadata:');
    expect(lines[0]).toContain('test_dataset');

    // Conversations should start from line 2
    const firstConv = JSON.parse(lines[1]);
    expect(firstConv).toHaveProperty('conversations');
  });

  it('should sanitize filename correctly', () => {
    const filename = ShareGPTExporter.generateFilename('Alice & Bob!!');
    expect(filename).toMatch(/^Alice_Bob_clone_dataset_\d{8}_\d{6}\.jsonl$/);
  });

  it('should handle string timestamps from persisted datasets', () => {
    const persistedMessages = mockMessages.map((message) => ({
      ...message,
      timestamp: message.timestamp.toISOString() as unknown as Date,
    }));
    const exporter = new ShareGPTExporter(persistedMessages, targetUser);

    const result = exporter.convertToShareGPT();

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].conversations[0].from).toBe('human');
  });
});
