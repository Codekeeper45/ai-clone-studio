import { Message, FilterConfig, ProcessingStats } from '../types';

/**
 * DatasetProcessor - Service for processing and filtering message datasets
 *
 * This class handles all dataset transformations including:
 * - Burst message merging (consecutive messages from same sender)
 * - Length-based filtering
 * - Lazy response removal
 * - Identity validation
 */
export class DatasetProcessor {
  private originalMessages: Message[];
  private processedMessages: Message[];
  private targetUser: string;
  private stats: ProcessingStats;

  constructor(messages: Message[], targetUser: string) {
    this.originalMessages = this.cloneMessages(messages);
    this.processedMessages = this.cloneMessages(messages);
    this.targetUser = targetUser;
    this.stats = {
      totalMessages: messages.length,
      filteredMessages: 0,
      mergedBursts: 0,
      lazyFiltered: 0,
      identityExcluded: 0,
      finalSampleCount: messages.length,
    };
  }

  /**
   * Applies all filters based on the provided configuration
   * Order: mergeBurstMessages → filterByLength → filterLazyResponses → validateIdentity
   */
  applyFilters(config: FilterConfig): void {
    // Reset to original state before applying filters
    this.reset();

    // Apply filters in order
    if (config.mergeBurstMessages) {
      this.mergeBurstMessages();
    }

    if (config.minMessageLength > 0) {
      this.filterByLength(config.minMessageLength);
    }

    if (config.filterLazyResponses && config.lazyPatterns.length > 0) {
      this.filterLazyResponses(config.lazyPatterns);
    }

    if (config.enableIdentityGuard) {
      this.validateIdentity();
    }

    // Update final count
    this.stats.finalSampleCount = this.processedMessages.length;
  }

  /**
   * Merges consecutive messages from the same sender within a 5-minute window
   * Texts are concatenated with \n, using first message's id and timestamp
   */
  mergeBurstMessages(): void {
    if (this.processedMessages.length === 0) return;

    const merged: Message[] = [];
    const BURST_WINDOW_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
    let mergeCount = 0;

    let currentBurst: Message | null = null;

    for (const message of this.processedMessages) {
      if (!currentBurst) {
        // Start a new burst
        currentBurst = { ...message };
        continue;
      }

      const isSameSender = currentBurst.sender.toLowerCase() === message.sender.toLowerCase();
      const timeDiff = new Date(message.timestamp).getTime() - new Date(currentBurst.timestamp).getTime();
      const withinWindow = timeDiff <= BURST_WINDOW_MS && timeDiff >= 0;

      if (isSameSender && withinWindow) {
        // Merge into current burst
        currentBurst.text = currentBurst.text + '\n' + message.text;
        mergeCount++;
      } else {
        // Save current burst and start new one
        merged.push(currentBurst);
        currentBurst = { ...message };
      }
    }

    // Don't forget the last burst
    if (currentBurst) {
      merged.push(currentBurst);
    }

    this.processedMessages = merged;
    this.stats.mergedBursts = mergeCount;
  }

  /**
   * Removes messages shorter than the specified minimum length
   */
  filterByLength(minLength: number): void {
    const beforeCount = this.processedMessages.length;

    this.processedMessages = this.processedMessages.filter(
      (msg) => msg.text.trim().length >= minLength
    );

    const filteredCount = beforeCount - this.processedMessages.length;
    this.stats.filteredMessages += filteredCount;
  }

  /**
   * Removes messages matching lazy response patterns
   * Supports both exact matching (case-insensitive) and regex patterns (starting with /)
   */
  filterLazyResponses(patterns: string[]): void {
    if (patterns.length === 0) return;

    const beforeCount = this.processedMessages.length;

    // Prepare patterns: compile regex or normalize exact matches
    const compiledPatterns: Array<{ type: 'exact' | 'regex'; value: string | RegExp }> = patterns.map(
      (pattern) => {
        const trimmed = pattern.trim();

        // Check if pattern is regex (starts with /)
        if (trimmed.startsWith('/') && trimmed.length > 1) {
          // Find the last slash to separate body from flags
          const lastSlashIndex = trimmed.lastIndexOf('/');

          if (lastSlashIndex > 0) {
            const regexBody = trimmed.slice(1, lastSlashIndex);
            const flags = trimmed.slice(lastSlashIndex + 1);

            try {
              return { type: 'regex' as const, value: new RegExp(regexBody, flags || 'i') };
            } catch {
              // If regex is invalid, fall through to exact match
            }
          }
        }

        return { type: 'exact' as const, value: trimmed.toLowerCase() };
      }
    );

    this.processedMessages = this.processedMessages.filter((msg) => {
      const text = msg.text.trim().toLowerCase();

      for (const pattern of compiledPatterns) {
        if (pattern.type === 'exact') {
          if (text === pattern.value) {
            return false; // Filter out
          }
        } else {
          // Regex pattern
          if ((pattern.value as RegExp).test(msg.text.trim())) {
            return false; // Filter out
          }
        }
      }

      return true; // Keep message
    });

    const filteredCount = beforeCount - this.processedMessages.length;
    this.stats.lazyFiltered = filteredCount;
  }

  /**
   * Removes messages not from the target user (case-insensitive)
   */
  validateIdentity(): void {
    const beforeCount = this.processedMessages.length;
    const targetUserLower = this.targetUser.toLowerCase();

    this.processedMessages = this.processedMessages.filter(
      (msg) => msg.sender.toLowerCase() === targetUserLower
    );

    const excludedCount = beforeCount - this.processedMessages.length;
    this.stats.identityExcluded = excludedCount;
  }

  /**
   * Returns current processing statistics
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Returns the processed messages
   */
  getProcessedMessages(): Message[] {
    return this.processedMessages;
  }

  /**
   * Returns the original messages
   */
  getOriginalMessages(): Message[] {
    return this.originalMessages;
  }

  /**
   * Resets processed messages to original state and clears stats
   */
  reset(): void {
    this.processedMessages = this.cloneMessages(this.originalMessages);
    this.stats = {
      totalMessages: this.originalMessages.length,
      filteredMessages: 0,
      mergedBursts: 0,
      lazyFiltered: 0,
      identityExcluded: 0,
      finalSampleCount: this.originalMessages.length,
    };
  }

  private cloneMessages(messages: Message[]): Message[] {
    return messages.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp),
      metadata: message.metadata ? { ...message.metadata } : undefined,
    }));
  }
}
