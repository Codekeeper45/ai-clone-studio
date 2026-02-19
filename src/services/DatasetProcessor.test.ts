import { describe, it, expect, beforeEach } from 'vitest';
import { DatasetProcessor } from './DatasetProcessor';
import { Message, FilterConfig } from '../types';

describe('DatasetProcessor', () => {
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
      timestamp: new Date('2024-01-01T10:01:30Z'),
      sender: 'Alice',
      text: 'How are you?',
      type: 'text'
    },
    {
      id: '4',
      timestamp: new Date('2024-01-01T10:10:00Z'),
      sender: 'Alice',
      text: 'Long time no see',
      type: 'text'
    },
    {
      id: '5',
      timestamp: new Date('2024-01-01T10:11:00Z'),
      sender: 'Bob',
      text: 'ok',
      type: 'text'
    },
    {
      id: '6',
      timestamp: new Date('2024-01-01T10:12:00Z'),
      sender: 'Alice',
      text: 'Short',
      type: 'text'
    }
  ];

  let processor: DatasetProcessor;

  beforeEach(() => {
    processor = new DatasetProcessor(mockMessages, targetUser);
  });

  it('should initialize with original messages', () => {
    expect(processor.getProcessedMessages()).toHaveLength(6);
    expect(processor.getStats().totalMessages).toBe(6);
  });

  it('should merge burst messages within 5-minute window', () => {
    processor.mergeBurstMessages();
    const processed = processor.getProcessedMessages();

    // Messages 2 and 3 should be merged because they are from Alice and 30s apart
    // Message 4 is from Alice but 8.5 minutes after Message 3, so it should NOT be merged
    expect(processed).toHaveLength(5);
    expect(processed[1].text).toBe('Hi Bob!\nHow are you?');
    expect(processed[1].sender).toBe('Alice');
    expect(processor.getStats().mergedBursts).toBe(1);
  });

  it('should filter messages by minimum length', () => {
    processor.filterByLength(5);
    const processed = processor.getProcessedMessages();

    // "ok" (2) should be filtered out. "Short" (5) should be kept (>= 5).
    expect(processed).toHaveLength(5);
    expect(processed.map(m => m.text)).not.toContain('ok');
    expect(processed.map(m => m.text)).toContain('Short');
    expect(processor.getStats().filteredMessages).toBe(1);
  });

  it('should filter lazy responses with exact patterns', () => {
    processor.filterLazyResponses(['ok']);
    const processed = processor.getProcessedMessages();

    expect(processed).toHaveLength(5);
    expect(processed.map(m => m.text)).not.toContain('ok');
    expect(processor.getStats().lazyFiltered).toBe(1);
  });

  it('should filter lazy responses with regex patterns', () => {
    // Filter any message that is just letters (case insensitive) and 2-5 chars long
    processor.filterLazyResponses(['/^[a-z]{2,5}$/i']);
    const processed = processor.getProcessedMessages();

    // "ok" and "Short" match
    expect(processed).toHaveLength(4);
    expect(processed.map(m => m.text)).not.toContain('ok');
    expect(processed.map(m => m.text)).not.toContain('Short');
  });

  it('should validate identity (keep only target user messages)', () => {
    processor.validateIdentity();
    const processed = processor.getProcessedMessages();

    expect(processed).toHaveLength(4);
    expect(processed.every(m => m.sender === targetUser)).toBe(true);
    expect(processor.getStats().identityExcluded).toBe(2);
  });

  it('should apply all filters in correct order via applyFilters', () => {
    const config: FilterConfig = {
      mergeBurstMessages: true,
      minMessageLength: 10,
      filterLazyResponses: true,
      lazyPatterns: ['ok'],
      enableIdentityGuard: true
    };

    processor.applyFilters(config);
    const processed = processor.getProcessedMessages();
    const stats = processor.getStats();

    // 1. Merge: 6 -> 5 messages (Alice's "Hi Bob!\nHow are you?")
    // 2. Length: "Hello Alice" (11), "Hi Bob!\nHow are you?" (20), "Long time no see" (16) remain.
    //    "ok" (2), "Short" (5) removed.
    // 3. Lazy: "ok" already gone.
    // 4. Identity: Keep only Alice's.
    //    Remaining Alice: "Hi Bob!\nHow are you?", "Long time no see"

    expect(processed).toHaveLength(2);
    expect(processed[0].text).toContain('Hi Bob!');
    expect(processed[1].text).toBe('Long time no see');
    expect(stats.finalSampleCount).toBe(2);
  });

  it('should reset to original state', () => {
    processor.validateIdentity();
    expect(processor.getProcessedMessages()).toHaveLength(4);

    processor.reset();
    expect(processor.getProcessedMessages()).toHaveLength(6);
    expect(processor.getStats().identityExcluded).toBe(0);
  });

  it('should preserve Date timestamps after filtering', () => {
    const config: FilterConfig = {
      mergeBurstMessages: true,
      minMessageLength: 0,
      filterLazyResponses: false,
      lazyPatterns: [],
      enableIdentityGuard: false,
    };

    processor.applyFilters(config);
    const processed = processor.getProcessedMessages();

    expect(processed.length).toBeGreaterThan(0);
    for (const message of processed) {
      expect(message.timestamp).toBeInstanceOf(Date);
      expect(Number.isNaN(message.timestamp.getTime())).toBe(false);
    }
  });
});
