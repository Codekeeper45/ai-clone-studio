import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageManager } from './StorageManager';
import { SavedDataset, AIConfig, FilterConfig } from '../types';

// Mock idb
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    transaction: vi.fn().mockReturnValue({
      objectStore: vi.fn().mockReturnValue({
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(undefined),
        getAll: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      }),
      done: Promise.resolve(),
    }),
  }),
}));

describe('StorageManager', () => {
  let storage: StorageManager;

  const mockDataset: SavedDataset = {
    id: 'test-id',
    name: 'Test Dataset',
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:00:00Z'),
    messageCount: 2,
    targetUser: 'Alice',
    messages: [
      { id: '1', timestamp: new Date(), sender: 'Bob', text: 'Hi', type: 'text' },
      { id: '2', timestamp: new Date(), sender: 'Alice', text: 'Hello', type: 'text' }
    ],
    filterConfig: {
      minMessageLength: 0,
      mergeBurstMessages: false,
      filterLazyResponses: false,
      lazyPatterns: [],
      enableIdentityGuard: false
    },
    version: 1
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new StorageManager();

    // Mock localStorage
    const store: Record<string, string> = {};
    global.localStorage = {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { for (const key in store) delete store[key]; }),
      length: 0,
      key: vi.fn((index) => Object.keys(store)[index] || null),
    };

    // Mock Crypto API for settings encryption tests
    // We mock the simple base64 fallback behavior that StorageManager uses when subtle is missing
    // or provide a basic subtle mock if needed.
    Object.defineProperty(global, 'crypto', {
      value: {
        subtle: undefined, // Test the fallback logic first
        getRandomValues: vi.fn((arr) => arr),
      },
      configurable: true
    });
  });

  it('should compress messages when saving a dataset', async () => {
    // We check if put was called with a string for messages instead of an array
    const dbMock = await (await import('idb')).openDB('', 0);
    const putSpy = dbMock.transaction('').objectStore('').put;

    await storage.saveDataset(mockDataset);

    expect(putSpy).toHaveBeenCalled();
    const storedObject = putSpy.mock.calls[0][0];
    expect(typeof storedObject.messages).toBe('string');
    expect(storedObject.messages.length).toBeGreaterThan(0);
  });

  it('should decompress messages when loading a dataset', async () => {
    // First save to get the compressed string
    const dbMock = await (await import('idb')).openDB('', 0);
    let storedData: unknown;
    dbMock.transaction('').objectStore('').put = vi.fn().mockImplementation((data: unknown) => {
      storedData = data;
      return Promise.resolve();
    });

    await storage.saveDataset(mockDataset);

    // Mock get to return the stored data
    dbMock.transaction('').objectStore('').get = vi.fn().mockResolvedValue(storedData);

    const loaded = await storage.loadDataset('test-id');

    expect(loaded).not.toBeNull();
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages[0].text).toBe('Hi');
    expect(loaded?.messages[0].timestamp).toBeInstanceOf(Date);
    expect(loaded?.id).toBe('test-id');
  });

  it('should encrypt and save settings', async () => {
    const aiConfig: AIConfig = {
      provider: 'openai',
      apiKey: 'sk-test-key',
      model: 'gpt-4',
      batchSize: 50
    };
    const filterConfig: FilterConfig = {
      minMessageLength: 10,
      mergeBurstMessages: true,
      filterLazyResponses: false,
      lazyPatterns: [],
      enableIdentityGuard: true
    };

    await storage.saveSettings({ aiConfig, filterConfig });

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'ai-clone-studio-settings',
      expect.stringContaining('aiConfig')
    );

    const stored = JSON.parse(localStorage.getItem('ai-clone-studio-settings')!);
    // Should be encrypted (base64 in fallback mode)
    expect(stored.aiConfig.apiKey).not.toBe('sk-test-key');
    expect(atob(stored.aiConfig.apiKey)).toBe('sk-test-key');
  });

  it('should load and decrypt settings', async () => {
    const aiConfig: AIConfig = {
      provider: 'openai',
      apiKey: 'sk-test-key',
      model: 'gpt-4',
      batchSize: 50
    };
    const filterConfig: FilterConfig = {
      minMessageLength: 10,
      mergeBurstMessages: true,
      filterLazyResponses: false,
      lazyPatterns: [],
      enableIdentityGuard: true
    };

    await storage.saveSettings({ aiConfig, filterConfig });
    const loaded = await storage.loadSettings();

    expect(loaded).not.toBeNull();
    expect(loaded?.aiConfig.apiKey).toBe('sk-test-key');
    expect(loaded?.filterConfig.minMessageLength).toBe(10);
    expect(loaded?.securityWarning).toContain('insecure fallback');
  });

  it('should handle missing settings', async () => {
    const loaded = await storage.loadSettings();
    expect(loaded).toBeNull();
  });
});
