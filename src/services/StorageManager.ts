import { openDB, IDBPDatabase } from 'idb';
import LZString from 'lz-string';
import { SavedDataset, AIConfig, FilterConfig, Message } from '../types';

interface StoredDataset extends Omit<SavedDataset, 'messages'> {
  messages: string; // Compressed string
}

interface EncryptionKey {
  jwk: JsonWebKey;
}

export interface SettingsPayload {
  aiConfig: AIConfig;
  filterConfig: FilterConfig;
}

export interface LoadedSettings extends SettingsPayload {
  securityWarning?: string;
}

export class StorageManager {
  private static DB_NAME = 'ai-clone-studio';
  private static DB_VERSION = 2;
  private static STORE_NAME = 'datasets';
  private static SETTINGS_KEY = 'ai-clone-studio-settings';
  private static ENCRYPTION_KEY = 'ai-clone-studio-crypto-key';
  private static MAX_STORAGE_MB = 100; // Increased to 100MB
  private static CURRENT_VERSION = 2;

  private db: IDBPDatabase | null = null;
  private cryptoKey: CryptoKey | null = null;

  private isWebCryptoAvailable(): boolean {
    return !!window.crypto && !!window.crypto.subtle;
  }

  isSecureCryptoAvailable(): boolean {
    return this.isWebCryptoAvailable() && !!window.isSecureContext;
  }

  /**
   * Initialize the IndexedDB connection with versioned upgrades
   */
  private async initDB(): Promise<IDBPDatabase> {
    if (this.db) {
      return this.db;
    }

    this.db = await openDB(StorageManager.DB_NAME, StorageManager.DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        console.info(`Upgrading IndexedDB from ${oldVersion} to ${newVersion}`);

        if (oldVersion < 1) {
          // Initial creation
          db.createObjectStore(StorageManager.STORE_NAME, { keyPath: 'id' });
        }

        if (oldVersion < 2) {
          // Migration for version 2: Could add indexes here if needed
          // e.g. db.getProjectStore(StorageManager.STORE_NAME).createIndex('targetUser', 'targetUser');
        }
      },
    });

    return this.db;
  }

  /**
   * Export all datasets as a single JSON file for backup
   */
  async exportAllData(): Promise<string> {
    const db = await this.initDB();
    const allStored = await db.getAll(StorageManager.STORE_NAME);
    const settings = await this.loadSettings();

    const backup = {
      timestamp: new Date().toISOString(),
      version: StorageManager.CURRENT_VERSION,
      datasets: allStored,
      settings: settings ? {
        aiConfig: { ...settings.aiConfig, apiKey: '***' }, // Don't export raw API keys in plain backup
        filterConfig: settings.filterConfig
      } : null
    };

    return JSON.stringify(backup, null, 2);
  }

  /**
   * Import datasets from a backup file
   */
  async importData(jsonContent: string): Promise<{ count: number }> {
    try {
      const backup = JSON.parse(jsonContent);
      if (!backup.datasets || !Array.isArray(backup.datasets)) {
        throw new Error('Invalid backup format');
      }

      const db = await this.initDB();
      const tx = db.transaction(StorageManager.STORE_NAME, 'readwrite');
      const store = tx.objectStore(StorageManager.STORE_NAME);

      let count = 0;
      for (const dataset of backup.datasets) {
        if (this.validateDataset(dataset)) {
          await store.put(dataset);
          count++;
        }
      }

      await tx.done;
      return { count };
    } catch (error) {
      console.error('Import failed:', error);
      throw new Error('Failed to import data: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Get or create encryption key for API key storage
   */
  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.cryptoKey) {
      return this.cryptoKey;
    }

    // Check if Web Crypto API is available
    if (!this.isWebCryptoAvailable()) {
      throw new Error('Web Crypto API not available. Please use HTTPS.');
    }

    try {
      // Try to load existing key
      const storedKey = localStorage.getItem(StorageManager.ENCRYPTION_KEY);

      if (storedKey) {
        const keyData: EncryptionKey = JSON.parse(storedKey);
        this.cryptoKey = await crypto.subtle.importKey(
          'jwk',
          keyData.jwk,
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
      } else {
        // Generate new key
        this.cryptoKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );

        // Export and store the key
        const jwk = await crypto.subtle.exportKey('jwk', this.cryptoKey);
        localStorage.setItem(
          StorageManager.ENCRYPTION_KEY,
          JSON.stringify({ jwk })
        );
      }

      return this.cryptoKey;
    } catch (error) {
      console.error('Failed to initialize encryption key:', error);
      throw new Error('Encryption initialization failed');
    }
  }

  /**
   * Encrypt a string using AES-GCM
   */
  private async encryptString(text: string): Promise<string> {
    if (!text) {
      return '';
    }

    // Check if Web Crypto API is available
    if (!this.isWebCryptoAvailable()) {
      console.warn('Web Crypto API not available, using base64 encoding (INSECURE)');
      return btoa(text);
    }

    try {
      const key = await this.getEncryptionKey();
      const encoder = new TextEncoder();
      const data = encoder.encode(text);

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      // Combine IV + ciphertext and convert to base64
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt a string using AES-GCM
   */
  private async decryptString(encrypted: string): Promise<string> {
    if (!encrypted) {
      return '';
    }

    // Check if Web Crypto API is available
    if (!this.isWebCryptoAvailable()) {
      console.warn('Web Crypto API not available, using base64 decoding (INSECURE)');
      try {
        return atob(encrypted);
      } catch {
        return encrypted; // Return as-is if not base64
      }
    }

    try {
      const key = await this.getEncryptionKey();

      // Decode from base64
      const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

      // Extract IV and ciphertext
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Calculate storage usage in bytes
   */
  private async calculateStorageSize(): Promise<number> {
    const db = await this.initDB();
    const tx = db.transaction(StorageManager.STORE_NAME, 'readonly');
    const store = tx.objectStore(StorageManager.STORE_NAME);
    const allDatasets = await store.getAll();

    let totalSize = 0;
    for (const dataset of allDatasets) {
      totalSize += JSON.stringify(dataset).length;
    }

    return totalSize;
  }

  /**
   * Validate dataset structure
   */
  private validateDataset(data: unknown): data is StoredDataset {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return (
      typeof d.id === 'string' &&
      typeof d.name === 'string' &&
      typeof d.targetUser === 'string' &&
      typeof d.messageCount === 'number' &&
      typeof d.messages === 'string' &&
      typeof d.version === 'number' &&
      !!d.createdAt &&
      !!d.updatedAt &&
      typeof d.filterConfig === 'object' &&
      d.filterConfig !== null
    );
  }

  /**
   * Save a dataset to IndexedDB
   */
  async saveDataset(dataset: SavedDataset): Promise<void> {
    const db = await this.initDB();

    // Check storage limit
    const currentSize = await this.calculateStorageSize();
    const estimatedSize = JSON.stringify(dataset).length;
    const maxBytes = StorageManager.MAX_STORAGE_MB * 1024 * 1024;

    if (currentSize + estimatedSize > maxBytes) {
      throw new Error(
        `Storage limit exceeded. Current usage: ${(currentSize / 1024 / 1024).toFixed(2)}MB, ` +
        `Limit: ${StorageManager.MAX_STORAGE_MB}MB. Please delete old datasets.`
      );
    }

    // Compress messages
    const compressedMessages = LZString.compressToUTF16(
      JSON.stringify(dataset.messages)
    );

    const storedDataset: StoredDataset = {
      ...dataset,
      messages: compressedMessages,
      updatedAt: new Date(),
      version: StorageManager.CURRENT_VERSION,
    };

    const tx = db.transaction(StorageManager.STORE_NAME, 'readwrite');
    await tx.objectStore(StorageManager.STORE_NAME).put(storedDataset);
    await tx.done;
  }

  /**
   * Load a dataset from IndexedDB
   */
  async loadDataset(id: string): Promise<SavedDataset | null> {
    const db = await this.initDB();
    const tx = db.transaction(StorageManager.STORE_NAME, 'readonly');
    const stored = await tx.objectStore(StorageManager.STORE_NAME).get(id);

    if (!stored) {
      return null;
    }

    // Validate structure
    if (!this.validateDataset(stored)) {
      console.error('Invalid dataset structure:', id);
      return null;
    }

    // Check version compatibility
    if (stored.version > StorageManager.CURRENT_VERSION) {
      console.error(
        `Dataset version ${stored.version} is newer than supported version ${StorageManager.CURRENT_VERSION}`
      );
      return null;
    }

    try {
      // Decompress messages
      const decompressed = LZString.decompressFromUTF16(stored.messages);
      if (!decompressed) {
        console.error('Failed to decompress dataset messages');
        return null;
      }

      const parsedMessages = JSON.parse(decompressed);
      if (!Array.isArray(parsedMessages)) {
        console.error('Invalid messages payload in dataset');
        return null;
      }

      const messages: Message[] = parsedMessages
        .map((message) => ({
          ...message,
          timestamp: new Date(message.timestamp),
        }))
        .filter((message) => !Number.isNaN(message.timestamp.getTime()));

      // Convert date strings back to Date objects
      const dataset: SavedDataset = {
        ...stored,
        messages,
        createdAt: new Date(stored.createdAt),
        updatedAt: new Date(stored.updatedAt),
      };

      return dataset;
    } catch (error) {
      console.error('Failed to load dataset:', error);
      return null;
    }
  }

  /**
   * List all datasets (metadata only)
   */
  async listDatasets(): Promise<
    Array<{
      id: string;
      name: string;
      createdAt: Date;
      updatedAt: Date;
      messageCount: number;
      targetUser: string;
    }>
  > {
    const db = await this.initDB();
    const tx = db.transaction(StorageManager.STORE_NAME, 'readonly');
    const allDatasets = await tx.objectStore(StorageManager.STORE_NAME).getAll();

    return allDatasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      createdAt: new Date(dataset.createdAt),
      updatedAt: new Date(dataset.updatedAt),
      messageCount: dataset.messageCount,
      targetUser: dataset.targetUser,
    }));
  }

  /**
   * Delete a dataset from IndexedDB
   */
  async deleteDataset(id: string): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction(StorageManager.STORE_NAME, 'readwrite');
    await tx.objectStore(StorageManager.STORE_NAME).delete(id);
    await tx.done;
  }

  /**
   * Get current storage usage
   */
  async getStorageUsage(): Promise<{ used: number; limit: number }> {
    const used = await this.calculateStorageSize();
    const limit = StorageManager.MAX_STORAGE_MB * 1024 * 1024;

    return {
      used,
      limit,
    };
  }

  /**
   * Clear all datasets
   */
  async clearAll(): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction(StorageManager.STORE_NAME, 'readwrite');
    await tx.objectStore(StorageManager.STORE_NAME).clear();
    await tx.done;
  }

  /**
   * Save settings to localStorage
   */
  async saveSettings(settings: SettingsPayload): Promise<void> {
    try {
      // Encrypt API key
      const encryptedApiKey = await this.encryptString(settings.aiConfig.apiKey);
      const encryptionMode = this.isSecureCryptoAvailable() ? 'aes-gcm' : 'base64';

      const settingsToStore = {
        aiConfig: {
          ...settings.aiConfig,
          apiKey: encryptedApiKey,
        },
        filterConfig: settings.filterConfig,
        security: {
          encryptionMode,
          insecureFallback: encryptionMode === 'base64',
        },
      };

      localStorage.setItem(
        StorageManager.SETTINGS_KEY,
        JSON.stringify(settingsToStore)
      );
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw new Error('Failed to save settings');
    }
  }

  /**
   * Load settings from localStorage
   */
  async loadSettings(): Promise<LoadedSettings | null> {
    try {
      const stored = localStorage.getItem(StorageManager.SETTINGS_KEY);

      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored);

      // Decrypt API key
      const decryptedApiKey = await this.decryptString(parsed.aiConfig.apiKey);

      const encryptionMode = parsed.security?.encryptionMode;
      const shouldWarn = encryptionMode === 'base64' || !this.isSecureCryptoAvailable();

      return {
        aiConfig: {
          ...parsed.aiConfig,
          apiKey: decryptedApiKey,
        },
        filterConfig: parsed.filterConfig,
        securityWarning: shouldWarn
          ? 'API key is stored with insecure fallback encoding in this environment.'
          : undefined,
      };
    } catch (error) {
      console.error('Failed to load settings:', error);
      return null;
    }
  }
}
