import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIServiceRouter } from './AIServiceRouter';
import { AIConfig, Message } from '../types';

describe('AIServiceRouter', () => {
  const mockConfig: AIConfig = {
    provider: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4o-mini',
    batchSize: 2
  };

  const mockMessages: Message[] = [
    { id: '1', timestamp: new Date(), sender: 'Alice', text: 'Hello', type: 'text' },
    { id: '2', timestamp: new Date(), sender: 'Bob', text: 'Hi', type: 'text' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  const mockModelsProbe = () => {
    (global.fetch as vi.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });
  };

  it('should calculate cost correctly for Gemini', () => {
    const geminiConfig: AIConfig = { ...mockConfig, provider: 'gemini' };
    const router = new AIServiceRouter(geminiConfig);

    // 1,000,000 tokens = $0.075
    expect(router.estimateCost(10000)).toBeCloseTo(0.075);
  });

  it('should calculate cost correctly for OpenAI', () => {
    const router = new AIServiceRouter(mockConfig);

    // 1,000,000 tokens = $0.15
    expect(router.estimateCost(10000)).toBeCloseTo(0.15);
  });

  it('should retry on API failure', async () => {
    const router = new AIServiceRouter(mockConfig);
    mockModelsProbe();

    // Fail twice, succeed once
    (global.fetch as vi.Mock)
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Error') })
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Error') })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify([{ conversations: [] }]) } }],
          usage: { total_tokens: 100 }
        })
      });

    const result = await router.cleanMessages(mockMessages, 'Bob');

    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(result.samples).toBeDefined();
  });

  it('should handle rate limits (429) by waiting', async () => {
    const router = new AIServiceRouter(mockConfig);
    mockModelsProbe();

    (global.fetch as vi.Mock)
      .mockResolvedValueOnce({ ok: false, status: 429, text: () => Promise.resolve('Rate limit') })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify([{ conversations: [] }]) } }],
          usage: { total_tokens: 50 }
        })
      });

    const result = await router.cleanMessages(mockMessages, 'Bob');

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result.samples).toBeDefined();
  });

  it('should parse JSON from markdown code blocks in LLM response', async () => {
    const router = new AIServiceRouter(mockConfig);
    const mockJson = [{ conversations: [{ from: 'human', value: 'hi' }] }];
    mockModelsProbe();

    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Sure, here is the JSON:\n```json\n' + JSON.stringify(mockJson) + '\n```' } }],
        usage: { total_tokens: 100 }
      })
    });

    const result = await router.cleanMessages(mockMessages, 'Bob');
    expect(result.samples).toEqual(mockJson);
  });

  it('should recover from truncated JSON responses', async () => {
    const router = new AIServiceRouter(mockConfig);
    const truncated =
      '[{"conversations":[{"from":"human","value":"hi"},{"from":"gpt","value":"ok"}';
    mockModelsProbe();

    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: truncated } }],
        usage: { total_tokens: 100 }
      })
    });

    const result = await router.cleanMessages(mockMessages, 'Bob');
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0].conversations[0].from).toBe('human');
  });

  it('should retry when provider returns empty response content', async () => {
    const router = new AIServiceRouter(mockConfig);
    mockModelsProbe();

    (global.fetch as vi.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '' } }],
          usage: { total_tokens: 20 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify([{ conversations: [] }]) } }],
          usage: { total_tokens: 40 }
        })
      });

    const result = await router.cleanMessages(mockMessages, 'Bob');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result.samples).toBeDefined();
  });

  it('should abort requests when signal is triggered', async () => {
    const router = new AIServiceRouter(mockConfig);
    const controller = new AbortController();
    mockModelsProbe();

    (global.fetch as vi.Mock).mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ ok: true, json: () => Promise.resolve({}) } as Response), 100);
    }));

    const cleanPromise = router.cleanMessages(mockMessages, 'Bob', undefined, controller.signal);
    controller.abort();

    await expect(cleanPromise).rejects.toThrow('Cancelled');
  });

  it('should handle string timestamps in cleaning prompt generation', async () => {
    const router = new AIServiceRouter(mockConfig);
    const persistedMessages: Message[] = [
      { id: '1', timestamp: '2024-01-01T10:00:00.000Z' as unknown as Date, sender: 'Alice', text: 'Hello', type: 'text' },
      { id: '2', timestamp: '2024-01-01T10:01:00.000Z' as unknown as Date, sender: 'Bob', text: 'Hi', type: 'text' },
    ];

    mockModelsProbe();
    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify([{ conversations: [] }]) } }],
        usage: { total_tokens: 20 },
      }),
    });

    const result = await router.cleanMessages(persistedMessages, 'Bob');
    expect(result.samples).toBeDefined();
  });

  it('should analyze style and parse JSON response', async () => {
    const router = new AIServiceRouter(mockConfig);
    mockModelsProbe();

    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              tone: 'friendly',
              vocabularyLevel: 'casual',
              humorStyle: 'light',
              typicalTopics: ['work'],
              uniquePhrases: ['let us go'],
              confidence: 0.88,
            }),
          },
        }],
        usage: { total_tokens: 80 },
      }),
    });

    const analysis = await router.analyzeStyle(mockMessages);
    expect(analysis.tone).toBe('friendly');
    expect(analysis.confidence).toBeCloseTo(0.88);
  });

  it('should audit quality and parse AI assessment', async () => {
    const router = new AIServiceRouter(mockConfig);
    mockModelsProbe();

    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 82,
              recommendations: ['Increase diversity'],
            }),
          },
        }],
        usage: { total_tokens: 90 },
      }),
    });

    const report = await router.auditQuality([
      {
        conversations: [
          { from: 'human', value: 'Hi' },
          { from: 'gpt', value: 'Hello there' },
        ],
      },
    ]);

    expect(report.score).toBe(82);
    expect(report.recommendations).toContain('Increase diversity');
  });

  it('should fail fast with clear message when endpoint is unreachable', async () => {
    const router = new AIServiceRouter(mockConfig);

    (global.fetch as vi.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(router.cleanMessages(mockMessages, 'Bob')).rejects.toThrow(/Cannot reach OpenAI endpoint/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
