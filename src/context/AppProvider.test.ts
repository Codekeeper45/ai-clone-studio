import { describe, it, expect } from 'vitest';
import { appReducer, Action } from './appReducer';
import {
  AppState,
  DEFAULT_AI_CONFIG,
  DEFAULT_FILTER_CONFIG,
  DEFAULT_MODAL_CONFIG,
  TrainingJob,
} from '../types';

const baseState: AppState = {
  rawMessages: [],
  processedMessages: [],
  targetUser: 'LegacyUser',
  participants: ['LegacyUser'],
  filterConfig: DEFAULT_FILTER_CONFIG,
  platform: 'telegram',
  aiConfig: DEFAULT_AI_CONFIG,
  modalConfig: DEFAULT_MODAL_CONFIG,
  cleaningProgress: 42,
  isCleaningActive: true,
  cleanedSamples: [{ conversations: [{ from: 'human', value: 'old' }, { from: 'gpt', value: 'data' }] }],
  styleAnalysis: {
    tone: 'old',
    vocabularyLevel: 'casual',
    humorStyle: 'dry',
    typicalTopics: ['legacy'],
    uniquePhrases: ['legacy'],
    confidence: 0.3,
  },
  qualityReport: {
    score: 10,
    sampleCount: 1,
    avgMessageLength: 1,
    conversationDiversity: 1,
    roleBalance: 0.5,
    warnings: ['old'],
    recommendations: ['old'],
  },
  trainingJobs: [{
    jobId: 'legacy-job',
    status: 'running',
    progress: 50,
    config: {
      baseModel: 'model',
      loraRank: 16,
      loraAlpha: 32,
      learningRate: 0.0002,
      epochs: 1,
      batchSize: 1,
    },
    logs: [],
  } as TrainingJob],
  activeJobId: 'legacy-job',
  currentStep: 'train',
  notifications: [],
  isLoading: false,
};

describe('AppProvider reducer dataset resets', () => {
  it('should clear derived state on SET_RAW_MESSAGES', () => {
    const action: Action = {
      type: 'SET_RAW_MESSAGES',
      payload: {
        messages: [{
          id: '1',
          timestamp: new Date('2024-01-01T00:00:00Z'),
          sender: 'Alice',
          text: 'Hello',
          type: 'text',
        }],
        participants: ['Alice'],
        platform: 'telegram',
      },
    };

    const next = appReducer(baseState, action);
    expect(next.targetUser).toBeNull();
    expect(next.cleanedSamples).toEqual([]);
    expect(next.styleAnalysis).toBeNull();
    expect(next.qualityReport).toBeNull();
    expect(next.trainingJobs).toEqual([]);
    expect(next.activeJobId).toBeNull();
    expect(next.cleaningProgress).toBe(0);
    expect(next.isCleaningActive).toBe(false);
  });

  it('should clear derived state on LOAD_DATASET', () => {
    const action: Action = {
      type: 'LOAD_DATASET',
      payload: {
        messages: [{
          id: '2',
          timestamp: new Date('2024-01-01T00:01:00Z'),
          sender: 'Bob',
          text: 'Hi',
          type: 'text',
          metadata: { platform: 'whatsapp' },
        }],
        targetUser: 'Bob',
        filterConfig: {
          minMessageLength: 5,
          mergeBurstMessages: false,
          filterLazyResponses: false,
          lazyPatterns: [],
          enableIdentityGuard: true,
        },
        participants: ['Bob'],
        platform: 'whatsapp',
      },
    };

    const next = appReducer(baseState, action);
    expect(next.targetUser).toBe('Bob');
    expect(next.platform).toBe('whatsapp');
    expect(next.cleanedSamples).toEqual([]);
    expect(next.trainingJobs).toEqual([]);
    expect(next.activeJobId).toBeNull();
  });
});
