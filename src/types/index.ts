// ============================================================
// Core Data Types for AI Clone Studio
// ============================================================

export interface Message {
  id: string;
  timestamp: Date;
  sender: string;
  text: string;
  type: 'text' | 'system' | 'media';
  metadata?: {
    platform?: string;
    replyTo?: string;
    edited?: boolean;
    forwarded?: boolean;
  };
}

export interface ParseResult {
  messages: Message[];
  participants: string[];
  dateRange: { start: Date; end: Date };
  platform: 'telegram' | 'whatsapp';
  error?: string;
}

export interface FilterConfig {
  minMessageLength: number;
  mergeBurstMessages: boolean;
  filterLazyResponses: boolean;
  lazyPatterns: string[];
  enableIdentityGuard: boolean;
}

export interface ProcessingStats {
  totalMessages: number;
  filteredMessages: number;
  mergedBursts: number;
  lazyFiltered: number;
  identityExcluded: number;
  finalSampleCount: number;
}

// ============================================================
// AI Service Types
// ============================================================

export interface AIConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  model: string;
  batchSize: number;
  endpoint?: string;
}

export interface CleaningRequest {
  messages: Message[];
  targetUser: string;
  systemPrompt: string;
}

export interface CleaningResponse {
  samples: ShareGPTConversation[];
  tokensUsed: number;
  cost: number;
}

export interface AnalysisResponse {
  tone: string;
  vocabularyLevel: string;
  humorStyle: string;
  typicalTopics: string[];
  uniquePhrases: string[];
  confidence: number;
}

export interface QualityReport {
  score: number;
  sampleCount: number;
  avgMessageLength: number;
  conversationDiversity: number;
  roleBalance: number;
  warnings: string[];
  recommendations: string[];
}

// ============================================================
// ShareGPT Format Types
// ============================================================

export interface ShareGPTMessage {
  from: 'human' | 'gpt';
  value: string;
}

export interface ShareGPTConversation {
  conversations: ShareGPTMessage[];
}

export interface ExportMetadata {
  dataset_name: string;
  target_user: string;
  creation_date: string;
  total_samples: number;
  platform: string;
  filters_applied: FilterConfig;
}

// ============================================================
// Training Types
// ============================================================

export interface TrainingConfig {
  baseModel: string;
  loraRank: number;
  loraAlpha: number;
  learningRate: number;
  epochs: number;
  batchSize: number;
}

export interface ModalConfig {
  tokenId: string;
  tokenSecret: string;
  workspace: string;
  gpu: 'A10G' | 'A100' | 'H100' | 'T4';
  endpoint: string;
}

export type ModelFamily = 'Llama' | 'Gemma' | 'Qwen' | 'Mistral' | 'Phi' | 'DeepSeek';

export const FAMILY_CHAT_TEMPLATES: Record<ModelFamily, string> = {
  Llama: 'llama-3.1',
  Gemma: 'gemma-3',
  Qwen: 'qwen-2.5',
  Mistral: 'chatml',
  Phi: 'phi-4',
  DeepSeek: 'deepseek',
};

export const TRAINING_MODELS: { id: string; name: string; params: string; family: string }[] = [
  // Llama — chat template: "llama-3.1"
  { id: 'unsloth/Llama-3.2-1B-Instruct-bnb-4bit', name: 'Llama 3.2 1B Instruct', params: '1B', family: 'Llama' },
  { id: 'unsloth/Llama-3.2-3B-Instruct-bnb-4bit', name: 'Llama 3.2 3B Instruct', params: '3B', family: 'Llama' },
  { id: 'unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit', name: 'Llama 3.1 8B Instruct', params: '8B', family: 'Llama' },
  { id: 'unsloth/Llama-3.1-8B-unsloth-bnb-4bit', name: 'Llama 3.1 8B (Dynamic)', params: '8B', family: 'Llama' },

  // Gemma — chat template: native (gemma-3)
  { id: 'unsloth/gemma-3-1b-it-unsloth-bnb-4bit', name: 'Gemma 3 1B', params: '1B', family: 'Gemma' },
  { id: 'unsloth/gemma-3-4b-it-unsloth-bnb-4bit', name: 'Gemma 3 4B', params: '4B', family: 'Gemma' },
  { id: 'unsloth/gemma-2-9b-it-bnb-4bit', name: 'Gemma 2 9B Instruct', params: '9B', family: 'Gemma' },
  { id: 'unsloth/gemma-3-12b-it-unsloth-bnb-4bit', name: 'Gemma 3 12B', params: '12B', family: 'Gemma' },

  // Qwen — chat template: "qwen-2.5" / "chatml"
  { id: 'unsloth/Qwen3-1.7B-unsloth-bnb-4bit', name: 'Qwen 3 1.7B', params: '1.7B', family: 'Qwen' },
  { id: 'unsloth/Qwen3-4B-unsloth-bnb-4bit', name: 'Qwen 3 4B', params: '4B', family: 'Qwen' },
  { id: 'unsloth/Qwen2.5-7B-Instruct-bnb-4bit', name: 'Qwen 2.5 7B Instruct', params: '7B', family: 'Qwen' },
  { id: 'unsloth/Qwen3-8B-unsloth-bnb-4bit', name: 'Qwen 3 8B', params: '8B', family: 'Qwen' },
  { id: 'unsloth/Qwen2.5-14B-Instruct-bnb-4bit', name: 'Qwen 2.5 14B Instruct', params: '14B', family: 'Qwen' },
  { id: 'unsloth/Qwen3-14B-unsloth-bnb-4bit', name: 'Qwen 3 14B', params: '14B', family: 'Qwen' },

  // Mistral — chat template: "chatml" / "mistral"
  { id: 'unsloth/mistral-7b-instruct-v0.3-bnb-4bit', name: 'Mistral 7B v0.3 Instruct', params: '7B', family: 'Mistral' },
  { id: 'unsloth/Mistral-Nemo-Instruct-2407-bnb-4bit', name: 'Mistral Nemo 12B Instruct', params: '12B', family: 'Mistral' },

  // Phi — chat template: "phi-4"
  { id: 'unsloth/Phi-4-mini-instruct-unsloth-bnb-4bit', name: 'Phi 4 Mini', params: '3.8B', family: 'Phi' },
  { id: 'unsloth/phi-4-unsloth-bnb-4bit', name: 'Phi 4', params: '14B', family: 'Phi' },

  // DeepSeek (дистилляты) — chat template: "deepseek"
  { id: 'unsloth/DeepSeek-R1-Distill-Qwen-7B-unsloth-bnb-4bit', name: 'DeepSeek R1 Qwen 7B', params: '7B', family: 'DeepSeek' },
  { id: 'unsloth/DeepSeek-R1-Distill-Qwen-14B-unsloth-bnb-4bit', name: 'DeepSeek R1 Qwen 14B', params: '14B', family: 'DeepSeek' },
  { id: 'unsloth/DeepSeek-R1-Distill-Llama-8B-unsloth-bnb-4bit', name: 'DeepSeek R1 Llama 8B', params: '8B', family: 'DeepSeek' },
];

export interface TrainingJob {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  config: TrainingConfig;
  logs: TrainingLog[];
  metrics?: TrainingMetrics;
  modelEndpoint?: string;
  error?: string;
}

export interface TrainingLog {
  timestamp: Date;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface TrainingMetrics {
  loss: number;
  evalLoss: number;
  perplexity: number;
}

// ============================================================
// Simulator Types
// ============================================================

export interface SimulatorMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ModelInfo {
  id: string;
  baseModel: string;
  finetuningDate: Date;
  datasetSize: number;
  endpoint: string;
}

// ============================================================
// Storage Types
// ============================================================

export interface SavedDataset {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  targetUser: string;
  messages: Message[];
  filterConfig: FilterConfig;
  version: number;
}

// ============================================================
// UI / App State Types
// ============================================================

export type AppStep = 'import' | 'process' | 'clean' | 'export' | 'train' | 'test';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  autoDismiss?: boolean;
}

export interface AppState {
  rawMessages: Message[];
  processedMessages: Message[];
  targetUser: string | null;
  participants: string[];
  filterConfig: FilterConfig;
  platform: 'telegram' | 'whatsapp' | null;

  aiConfig: AIConfig;
  modalConfig: ModalConfig;
  cleaningProgress: number;
  isCleaningActive: boolean;
  cleanedSamples: ShareGPTConversation[];
  styleAnalysis: AnalysisResponse | null;
  qualityReport: QualityReport | null;

  trainingJobs: TrainingJob[];
  activeJobId: string | null;

  currentStep: AppStep;
  notifications: Notification[];
  isLoading: boolean;
}

export interface UserFacingError {
  title: string;
  message: string;
  action: 'retry' | 'manage_storage' | 'contact_support' | 'reconfigure';
  recoverable: boolean;
}

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  minMessageLength: 10,
  mergeBurstMessages: true,
  filterLazyResponses: true,
  lazyPatterns: ['ok', 'ок', 'lol', 'лол', 'да', 'нет', 'ага', 'угу', '👍', '😂', '😅', 'хз', 'ну', 'haha', 'yes', 'no', 'yep', 'nope', 'k', 'kk'],
  enableIdentityGuard: true,
};

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-1.5-flash',
  batchSize: 50,
  endpoint: ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_OPENAI_BASE_URL || 'http://127.0.0.1:8045/v1').replace(/\/+$/, ''),
};

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  baseModel: 'unsloth/Qwen3-8B-unsloth-bnb-4bit',
  loraRank: 16,
  loraAlpha: 32,
  learningRate: 0.0002,
  epochs: 3,
  batchSize: 4,
};

export const DEFAULT_MODAL_CONFIG: ModalConfig = {
  tokenId: '',
  tokenSecret: '',
  workspace: '',
  gpu: 'A10G',
  endpoint: '',
};
