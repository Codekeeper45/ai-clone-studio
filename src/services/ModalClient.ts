import {
  TrainingConfig,
  TrainingJob,
  TrainingLog,
  TrainingMetrics,
  ModalConfig,
  TRAINING_MODELS,
} from '../types';

// ============================================================
// Modal API Response Types
// ============================================================

interface ModalJobResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  start_time?: string;
  end_time?: string;
  created_at?: string;
  config: {
    model_id: string;
    family: string;
    lora_rank: number;
    lora_alpha: number;
    learning_rate: number;
    epochs: number;
    batch_size: number;
    gradient_accumulation_steps: number;
  };
  logs?: Array<{
    timestamp: string;
    level: 'info' | 'warning' | 'error';
    message: string;
  }>;
  metrics?: {
    loss: number;
    eval_loss: number;
    perplexity: number;
  };
  model_endpoint?: string;
  lora_path?: string;
  gguf_path?: string;
  error?: string;
}

interface TrainedModel {
  job_id: string;
  model_id: string;
  family: string;
  completed_at: string;
  metrics?: { loss: number; eval_loss: number; perplexity: number };
}

interface InferenceResponse {
  choices: Array<{
    message: { role: string; content: string };
  }>;
}

// ============================================================
// Modal Client — Real Modal.com Webhook Integration
// ============================================================

export class ModalClient {
  private endpoint: string;
  private authToken: string;
  private activeAbortControllers: Map<string, AbortController> = new Map();
  private activeEventSources: Map<string, EventSource> = new Map();

  constructor(config: ModalConfig) {
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.authToken = `${config.tokenId}:${config.tokenSecret}`;
  }

  // ============================================================
  // Training API
  // ============================================================

  /**
   * Start a fine-tuning job by sending dataset + config to Modal backend.
   */
  async startTraining(
    datasetJsonl: string,
    config: TrainingConfig,
    signal?: AbortSignal
  ): Promise<string> {
    const model = TRAINING_MODELS.find(m => m.id === config.baseModel);
    const family = model?.family || 'Llama';

    const response = await this.request('/train', {
      method: 'POST',
      body: JSON.stringify({
        dataset: datasetJsonl,
        config: {
          model_id: config.baseModel,
          family,
          lora_rank: config.loraRank,
          lora_alpha: config.loraAlpha,
          learning_rate: config.learningRate,
          epochs: config.epochs,
          batch_size: config.batchSize,
          gradient_accumulation_steps: 4,
          max_seq_length: 2048,
        },
      }),
      signal,
    });

    const data = await response.json();
    return data.job_id;
  }

  /**
   * Get the current status of a training job.
   */
  async getJobStatus(jobId: string, signal?: AbortSignal): Promise<TrainingJob> {
    const response = await this.request(`/status/${jobId}`, { signal });
    const data: ModalJobResponse = await response.json();
    return this.mapToTrainingJob(data);
  }

  /**
   * Stream training logs via Server-Sent Events.
   * Returns a cleanup function to close the connection.
   */
  streamLogs(
    jobId: string,
    onLog: (log: TrainingLog) => void,
    onStatus: (status: string, progress: number) => void,
    onDone: (job: ModalJobResponse) => void,
    onError: (error: Error) => void
  ): () => void {
    const url = `${this.endpoint}/logs/${jobId}`;
    const eventSource = new EventSource(url);

    this.activeEventSources.set(jobId, eventSource);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          onError(new Error(data.error));
          return;
        }
        onLog({
          timestamp: new Date(data.timestamp),
          level: data.level || 'info',
          message: data.message || '',
        });
      } catch {
        // ignore malformed events
      }
    };

    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        onStatus(data.status, data.progress || 0);
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener('done', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        onDone(data);
      } catch {
        // ignore
      }
      eventSource.close();
      this.activeEventSources.delete(jobId);
    });

    eventSource.onerror = () => {
      onError(new Error('SSE connection lost'));
      eventSource.close();
      this.activeEventSources.delete(jobId);
    };

    return () => {
      eventSource.close();
      this.activeEventSources.delete(jobId);
    };
  }

  /**
   * Cancel a running training job.
   */
  async cancelTraining(jobId: string, signal?: AbortSignal): Promise<void> {
    await this.request(`/cancel/${jobId}`, { method: 'POST', signal });
  }

  /**
   * Poll job status with adaptive intervals.
   * 2s while running, 5s while queued.
   */
  async pollJobUntilDone(
    jobId: string,
    onUpdate: (job: TrainingJob) => void,
    signal?: AbortSignal
  ): Promise<TrainingJob> {
    const controller = new AbortController();
    this.activeAbortControllers.set(jobId, controller);

    const combinedSignal = signal
      ? this.combineSignals(signal, controller.signal)
      : controller.signal;

    try {
      while (!combinedSignal.aborted) {
        const job = await this.getJobStatus(jobId, combinedSignal);
        onUpdate(job);

        if (job.status === 'completed' || job.status === 'failed') {
          return job;
        }

        const delay = job.status === 'running' ? 2000 : 5000;
        await this.sleep(delay, combinedSignal);
      }
      throw new Error('Polling aborted');
    } finally {
      this.activeAbortControllers.delete(jobId);
    }
  }

  // ============================================================
  // Model Management API
  // ============================================================

  /**
   * List all trained models on the Modal volume.
   */
  async listModels(signal?: AbortSignal): Promise<TrainedModel[]> {
    const response = await this.request('/models', { signal });
    const data = await response.json();
    return data.models || [];
  }

  // ============================================================
  // Inference API
  // ============================================================

  /**
   * Run inference on a trained model.
   * Returns the assistant's response text.
   */
  async runInference(
    jobId: string,
    messages: Array<{ role: string; content: string }>,
    options?: { maxTokens?: number; temperature?: number },
    signal?: AbortSignal
  ): Promise<string> {
    const response = await this.request('/inference', {
      method: 'POST',
      body: JSON.stringify({
        job_id: jobId,
        messages,
        max_tokens: options?.maxTokens || 500,
        temperature: options?.temperature || 0.8,
      }),
      signal,
    });

    const data: InferenceResponse = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid inference response');
    }
    return data.choices[0].message.content;
  }

  // ============================================================
  // Cleanup
  // ============================================================

  /**
   * Stop all active polling and SSE connections.
   */
  stopAll(): void {
    for (const [, controller] of this.activeAbortControllers) {
      controller.abort();
    }
    this.activeAbortControllers.clear();

    for (const [, es] of this.activeEventSources) {
      es.close();
    }
    this.activeEventSources.clear();
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private async request(
    path: string,
    options: RequestInit & { signal?: AbortSignal } = {}
  ): Promise<Response> {
    const url = `${this.endpoint}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Modal-Token': this.authToken,
      ...(options.headers as Record<string, string> || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `Modal API error (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = `Modal API error (${response.status}): ${errorData.detail || errorData.message || response.statusText}`;
      } catch {
        errorMessage = `Modal API error (${response.status}): ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response;
  }

  private mapToTrainingJob(data: ModalJobResponse): TrainingJob {
    const logs: TrainingLog[] = (data.logs || []).map(log => ({
      timestamp: new Date(log.timestamp),
      level: log.level,
      message: log.message,
    }));

    const metrics: TrainingMetrics | undefined = data.metrics
      ? {
          loss: data.metrics.loss,
          evalLoss: data.metrics.eval_loss,
          perplexity: data.metrics.perplexity,
        }
      : undefined;

    const config: TrainingConfig = {
      baseModel: data.config.model_id,
      loraRank: data.config.lora_rank,
      loraAlpha: data.config.lora_alpha,
      learningRate: data.config.learning_rate,
      epochs: data.config.epochs,
      batchSize: data.config.batch_size,
    };

    return {
      jobId: data.job_id,
      status: data.status,
      progress: data.progress,
      startTime: data.start_time ? new Date(data.start_time) : undefined,
      endTime: data.end_time ? new Date(data.end_time) : undefined,
      config,
      logs,
      metrics,
      modelEndpoint: data.model_endpoint,
      error: data.error,
    };
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Aborted'));
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      }, { once: true });
    });
  }

  private combineSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        return controller.signal;
      }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  }
}
