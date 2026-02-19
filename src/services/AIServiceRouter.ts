import {
  AIConfig,
  Message,
  ShareGPTConversation,
  AnalysisResponse,
  QualityReport,
} from '../types';

// ============================================================
// Rate Limiter — Token Bucket
// ============================================================

class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  private lastRefill: number;

  constructor(maxRequestsPerMinute: number) {
    this.maxTokens = maxRequestsPerMinute;
    this.tokens = maxRequestsPerMinute;
    this.refillRate = maxRequestsPerMinute / 60;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait until a token is available
    const waitMs = ((1 - this.tokens) / this.refillRate) * 1000;
    await new Promise(resolve => setTimeout(resolve, Math.ceil(waitMs)));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// ============================================================
// AI Service Router - Provider Abstraction Layer
// ============================================================

export class AIServiceRouter {
  private config: AIConfig;
  private rateLimiter: RateLimiter;
  private openAIBaseUrl: string;
  private openAIReachabilityChecked = false;

  constructor(config: AIConfig) {
    this.config = config;
    const envBaseUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
      .env?.VITE_OPENAI_BASE_URL;
    this.openAIBaseUrl = this.normalizeEndpoint(config.endpoint || envBaseUrl || 'http://127.0.0.1:8045/v1');
    // Gemini free tier: 15 RPM; paid ~1500 RPM. OpenAI: ~500 RPM.
    const rpm = config.provider === 'gemini' ? 14 : 60;
    this.rateLimiter = new RateLimiter(rpm);
  }

  /**
   * Clean raw messages and convert to ShareGPT format using AI
   */
  async cleanMessages(
    messages: Message[],
    targetUser: string,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<{ samples: ShareGPTConversation[], tokensUsed: number, cost: number }> {
    const batches = this.createBatches(messages, this.config.batchSize);
    const allSamples: ShareGPTConversation[] = [];
    let totalTokensUsed = 0;

    for (let i = 0; i < batches.length; i++) {
      if (signal?.aborted) throw new Error('Cancelled');

      const batch = batches[i];

      const systemPrompt = `You are a data cleaning assistant. Convert the following chat messages into ShareGPT training format. The target user is '${targetUser}' and should be mapped to the 'gpt' role. All other participants are 'human'. Remove spam, system messages, and low-quality content. Preserve the target user's personality, slang, and communication style. Output valid JSON array of conversations.`;

      const userPrompt = this.buildCleaningPrompt(batch, targetUser);

      await this.rateLimiter.acquire();
      const response = await this.callAPI(systemPrompt, userPrompt, signal);
      const parsedSamples = this.parseJSONFromLLM<ShareGPTConversation[]>(response.text);

      allSamples.push(...parsedSamples);
      totalTokensUsed += response.tokensUsed;

      if (onProgress) {
        const progress = ((i + 1) / batches.length) * 100;
        onProgress(progress);
      }
    }

    const cost = this.calculateCost(totalTokensUsed);

    return {
      samples: allSamples,
      tokensUsed: totalTokensUsed,
      cost
    };
  }

  /**
   * Analyze communication style of messages
   */
  async analyzeStyle(messages: Message[], signal?: AbortSignal): Promise<AnalysisResponse> {
    const sample = messages.slice(0, 100);

    const systemPrompt = "You are a communication style analyst. Analyze the provided messages and return insights about the person's communication style.";

    const userPrompt = `Analyze the communication style of this person based on their messages. Return a JSON object with: tone (string), vocabularyLevel (string: 'casual'/'moderate'/'formal'/'mixed'), humorStyle (string), typicalTopics (string[]), uniquePhrases (string[]), confidence (number 0-1). If insufficient data, set confidence below 0.5.

Messages:
${sample.map(m => `[${m.sender}]: ${m.text}`).join('\n')}

Respond with valid JSON only.`;

    await this.rateLimiter.acquire();
    const response = await this.callAPI(systemPrompt, userPrompt, signal);
    return this.parseJSONFromLLM<AnalysisResponse>(response.text);
  }

  /**
   * Audit quality of cleaned dataset
   */
  async auditQuality(dataset: ShareGPTConversation[], signal?: AbortSignal): Promise<QualityReport> {
    const sampleCount = dataset.length;

    let totalMessages = 0;
    let totalLength = 0;
    let assistantCount = 0;

    dataset.forEach(conv => {
      conv.conversations.forEach(msg => {
        totalMessages++;
        totalLength += msg.value.length;
        if (msg.from === 'gpt') assistantCount++;
      });
    });

    const avgMessageLength = totalMessages > 0 ? totalLength / totalMessages : 0;
    const roleBalance = totalMessages > 0 ? assistantCount / totalMessages : 0;

    const conversationLengths = dataset.map(c => c.conversations.length);
    const uniqueLengths = new Set(conversationLengths).size;
    const conversationDiversity = conversationLengths.length > 0
      ? uniqueLengths / conversationLengths.length
      : 0;

    const warnings: string[] = [];
    if (sampleCount < 100) {
      warnings.push(`Dataset is small (${sampleCount} samples). Recommend at least 100 samples for quality training.`);
    }
    if (roleBalance > 0.8) {
      warnings.push('Dataset is heavily skewed towards assistant messages. Balance may affect training quality.');
    }
    if (roleBalance < 0.2) {
      warnings.push('Dataset is heavily skewed towards human messages. Balance may affect training quality.');
    }
    if (avgMessageLength < 20) {
      warnings.push('Average message length is very short. Consider filtering for more substantive conversations.');
    }

    const systemPrompt = "You are a dataset quality auditor. Analyze the provided metrics and generate quality recommendations.";

    const userPrompt = `Analyze this dataset quality metrics and provide a quality score (0-100) and recommendations.

Metrics:
- Sample count: ${sampleCount}
- Average message length: ${avgMessageLength.toFixed(2)} characters
- Conversation diversity: ${conversationDiversity.toFixed(2)}
- Role balance (assistant ratio): ${roleBalance.toFixed(2)}
- Warnings: ${warnings.join('; ') || 'None'}

Return JSON with: score (number 0-100), recommendations (string[]).`;

    await this.rateLimiter.acquire();
    const response = await this.callAPI(systemPrompt, userPrompt, signal);
    const aiAssessment = this.parseJSONFromLLM<{ score: number, recommendations: string[] }>(response.text);

    return {
      score: aiAssessment.score,
      sampleCount,
      avgMessageLength,
      conversationDiversity,
      roleBalance,
      warnings,
      recommendations: aiAssessment.recommendations
    };
  }

  estimateCost(messageCount: number): number {
    const estimatedTokens = messageCount * 100;
    return this.calculateCost(estimatedTokens);
  }

  // ============================================================
  // Private Helper Methods
  // ============================================================

  private async callAPI(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal
  ): Promise<{ text: string, tokensUsed: number }> {
    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (signal?.aborted) throw new Error('Cancelled');

      try {
        if (this.config.provider === 'gemini') {
          return await this.callGemini(systemPrompt, userPrompt, signal);
        } else if (this.config.provider === 'openai') {
          return await this.callOpenAI(systemPrompt, userPrompt, signal);
        } else {
          throw new Error(`Unsupported provider: ${this.config.provider}`);
        }
      } catch (error) {
        if (signal?.aborted) throw new Error('Cancelled');
        // Detect rate limit errors and wait longer
        const msg = error instanceof Error ? error.message : String(error);
        if (!this.isRetryableError(msg)) {
          throw new Error(`API call failed: ${msg}`);
        }
        if (msg.includes('429') && attempt < maxRetries - 1) {
          await this.sleep(retryDelays[attempt] * 3);
          continue;
        }
        if (attempt < maxRetries - 1) {
          await this.sleep(retryDelays[attempt]);
        } else {
          throw new Error(`API call failed after ${maxRetries} attempts: ${msg}`);
        }
      }
    }

    throw new Error('Unexpected error in callAPI');
  }

  private async callGemini(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal
  ): Promise<{ text: string, tokensUsed: number }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // Validate prompt size (rough token estimate: 4 chars per token)
    const estimatedTokens = Math.ceil(combinedPrompt.length / 4);
    if (estimatedTokens > 900000) {
      throw new Error(`Prompt too large (~${estimatedTokens} tokens). Reduce batch size.`);
    }

    const body = {
      contents: [
        {
          parts: [
            {
              text: combinedPrompt
            }
          ]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response structure from Gemini API');
    }

    const parts = Array.isArray(data.candidates[0].content.parts)
      ? data.candidates[0].content.parts
      : [];
    const text = parts
      .map((part: { text?: string }) => part?.text || '')
      .join('\n')
      .trim();
    if (!text) {
      throw new Error('Empty response content from Gemini API');
    }
    const tokensUsed = data.usageMetadata?.totalTokenCount
      || Math.ceil((combinedPrompt.length + text.length) / 4);

    return { text, tokensUsed };
  }

  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal
  ): Promise<{ text: string, tokensUsed: number }> {
    await this.ensureOpenAIReachable(signal);
    const url = `${this.openAIBaseUrl}/chat/completions`;

    // Validate prompt size
    const estimatedTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    if (estimatedTokens > 120000) {
      throw new Error(`Prompt too large (~${estimatedTokens} tokens). Reduce batch size.`);
    }

    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw new Error(this.buildNetworkError(url, error));
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response structure from OpenAI API');
    }

    const content = data.choices[0].message.content;
    const text = typeof content === 'string'
      ? content.trim()
      : Array.isArray(content)
        ? content.map((part: { text?: string }) => part?.text || '').join('\n').trim()
        : '';
    if (!text) {
      throw new Error('Empty response content from OpenAI API');
    }
    const tokensUsed = data.usage?.total_tokens || Math.ceil((systemPrompt.length + userPrompt.length + text.length) / 4);

    return { text, tokensUsed };
  }

  private normalizeEndpoint(rawEndpoint: string): string {
    const input = (rawEndpoint || '').trim();
    if (!input) {
      return 'http://127.0.0.1:8045/v1';
    }

    const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
    try {
      const parsed = new URL(withProtocol);
      return parsed.toString().replace(/\/+$/, '');
    } catch {
      // Keep value as-is; later requests will produce actionable validation errors.
      return withProtocol.replace(/\/+$/, '');
    }
  }

  private isRetryableError(message: string): boolean {
    const msg = (message || '').toLowerCase();
    if (msg.includes('unsupported provider')) return false;
    if (msg.includes('prompt too large')) return false;
    if (msg.includes('cannot reach openai endpoint')) return false;
    if (msg.includes('invalid endpoint url')) return false;
    return true;
  }

  private async ensureOpenAIReachable(signal?: AbortSignal): Promise<void> {
    if (this.openAIReachabilityChecked) return;

    const modelsUrl = `${this.openAIBaseUrl}/models`;
    try {
      // Endpoint reachability probe. Any HTTP status means network path exists.
      await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        signal,
      });
      this.openAIReachabilityChecked = true;
    } catch (error) {
      throw new Error(
        `Cannot reach OpenAI endpoint ${this.openAIBaseUrl}. ` +
        `Ensure the proxy/API server is running and accessible from the app (network/CORS). ` +
        `Details: ${this.unwrapNetworkError(error)}`
      );
    }
  }

  private buildNetworkError(url: string, error: unknown): string {
    return (
      `Network error while requesting ${url}. ` +
      `Check endpoint availability and CORS policy. ` +
      `Details: ${this.unwrapNetworkError(error)}`
    );
  }

  private unwrapNetworkError(error: unknown): string {
    if (!error) return 'Unknown network error';
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message || error.name;
    return String(error);
  }

  private parseJSONFromLLM<T>(text: string): T {
    const normalized = (text || '').replace(/^\uFEFF/, '').trim();
    if (!normalized) {
      throw new Error('Failed to parse JSON from LLM response: empty response');
    }

    const candidates = this.collectJsonCandidates(normalized);
    let lastError: unknown = null;

    for (const candidate of candidates) {
      try {
        return this.parseJsonCandidate<T>(candidate);
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`Failed to parse JSON from LLM response: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  private collectJsonCandidates(text: string): string[] {
    const candidates = new Set<string>();
    candidates.add(text);

    const codeBlocks = text.matchAll(/```(?:json)?\s*\n?([\s\S]*?)\n?```/gi);
    for (const match of codeBlocks) {
      if (match[1]?.trim()) {
        candidates.add(match[1].trim());
      }
    }

    const withoutFences = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    if (withoutFences) {
      candidates.add(withoutFences);
    }

    const firstJsonLike = this.extractFirstJsonLikeSegment(text);
    if (firstJsonLike) {
      candidates.add(firstJsonLike);
    }

    return Array.from(candidates);
  }

  private parseJsonCandidate<T>(candidate: string): T {
    const direct = candidate.trim();
    if (!direct) {
      throw new Error('empty candidate');
    }

    const attempts: string[] = [direct];

    const trimmedWindow = this.extractFirstJsonLikeSegment(direct);
    if (trimmedWindow && trimmedWindow !== direct) {
      attempts.push(trimmedWindow);
    }

    const balanced = this.extractBalancedJsonPrefix(direct);
    if (balanced && !attempts.includes(balanced)) {
      attempts.push(balanced);
    }

    const repaired = this.repairIncompleteJson(direct);
    if (repaired && !attempts.includes(repaired)) {
      attempts.push(repaired);
    }

    let lastError: unknown = null;
    for (const attempt of attempts) {
      const normalizedAttempt = attempt.replace(/,\s*([}\]])/g, '$1').trim();
      if (!normalizedAttempt) continue;
      try {
        return JSON.parse(normalizedAttempt) as T;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('unable to parse candidate');
  }

  private extractFirstJsonLikeSegment(text: string): string | null {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');

    if (firstBrace < 0 && firstBracket < 0) return null;

    const start = firstBrace < 0
      ? firstBracket
      : firstBracket < 0
        ? firstBrace
        : Math.min(firstBrace, firstBracket);

    const tail = text.slice(start).trim();
    if (!tail) return null;

    const lastBrace = tail.lastIndexOf('}');
    const lastBracket = tail.lastIndexOf(']');
    const end = Math.max(lastBrace, lastBracket);

    if (end > 0) {
      return tail.slice(0, end + 1);
    }

    return tail;
  }

  private extractBalancedJsonPrefix(text: string): string | null {
    const first = text.search(/[[{]/);
    if (first < 0) return null;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    let lastBalancedIndex = -1;

    for (let i = first; i < text.length; i++) {
      const char = text[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        if (inString) escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }

      if (char === '}' || char === ']') {
        const top = stack[stack.length - 1];
        if (
          (char === '}' && top === '{') ||
          (char === ']' && top === '[')
        ) {
          stack.pop();
          if (stack.length === 0) {
            lastBalancedIndex = i;
          }
        } else {
          break;
        }
      }
    }

    if (lastBalancedIndex >= first) {
      return text.slice(first, lastBalancedIndex + 1).trim();
    }

    return null;
  }

  private repairIncompleteJson(text: string): string | null {
    const first = text.search(/[[{]/);
    if (first < 0) return null;

    const source = text.slice(first);
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    let output = '';

    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      output += char;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' || char === ']') {
        const top = stack[stack.length - 1];
        if (
          (char === '}' && top === '{') ||
          (char === ']' && top === '[')
        ) {
          stack.pop();
        }
      }
    }

    if (inString) {
      output += '"';
    }

    while (stack.length > 0) {
      const open = stack.pop();
      output += open === '{' ? '}' : ']';
    }

    return output.trim();
  }

  private createBatches(messages: Message[], batchSize: number): Message[][] {
    const batches: Message[][] = [];
    for (let i = 0; i < messages.length; i += batchSize) {
      batches.push(messages.slice(i, i + batchSize));
    }
    return batches;
  }

  private buildCleaningPrompt(messages: Message[], targetUser: string): string {
    const messageLines = messages.map(m =>
      `[${this.toIsoTimestamp(m.timestamp)}] ${m.sender}: ${m.text}`
    ).join('\n');

    return `Convert these messages to ShareGPT format. Target user "${targetUser}" should be "gpt", others are "human".

Messages:
${messageLines}

Return a JSON array of conversations. Each conversation has a "conversations" array with objects containing "from" ('human' or 'gpt') and "value" (the message text). Group related messages into conversations. Remove spam and low-quality content.

Example format:
[
  {
    "conversations": [
      { "from": "human", "value": "Hello" },
      { "from": "gpt", "value": "Hi there!" }
    ]
  }
]

Respond with valid JSON only.`;
  }

  private toIsoTimestamp(timestamp: Date | string): string {
    const normalized = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (Number.isNaN(normalized.getTime())) {
      return 'invalid-timestamp';
    }
    return normalized.toISOString();
  }

  private calculateCost(tokens: number): number {
    const tokensInMillions = tokens / 1_000_000;

    if (this.config.provider === 'gemini') {
      return tokensInMillions * 0.075;
    } else if (this.config.provider === 'openai') {
      return tokensInMillions * 0.15;
    }

    return 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
