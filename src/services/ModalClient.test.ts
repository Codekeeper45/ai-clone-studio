import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModalClient } from './ModalClient';
import { ModalConfig, TrainingConfig } from '../types';

describe('ModalClient', () => {
  const modalConfig: ModalConfig = {
    tokenId: 'ak-test',
    tokenSecret: 'as-test',
    workspace: 'ws',
    gpu: 'A10G',
    endpoint: 'https://example.modal.run',
  };

  const trainingConfig: TrainingConfig = {
    baseModel: 'unsloth/Qwen3-8B-unsloth-bnb-4bit',
    loraRank: 16,
    loraAlpha: 32,
    learningRate: 0.0002,
    epochs: 1,
    batchSize: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should send auth header when starting training', async () => {
    const client = new ModalClient(modalConfig);
    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ job_id: 'job-123' }),
    });

    const jobId = await client.startTraining('{"conversations":[]}', trainingConfig);

    expect(jobId).toBe('job-123');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.modal.run/train',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Modal-Token': 'ak-test:as-test',
        }),
      })
    );
  });

  it('should resolve polling when job reaches completed status', async () => {
    const client = new ModalClient(modalConfig);
    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        job_id: 'job-1',
        status: 'completed',
        progress: 100,
        config: {
          model_id: trainingConfig.baseModel,
          family: 'Qwen',
          lora_rank: 16,
          lora_alpha: 32,
          learning_rate: 0.0002,
          epochs: 1,
          batch_size: 1,
          gradient_accumulation_steps: 4,
        },
      }),
    });

    const updates: string[] = [];
    const result = await client.pollJobUntilDone('job-1', (job) => {
      updates.push(job.status);
    });

    expect(result.status).toBe('completed');
    expect(updates).toEqual(['completed']);
  });

  it('should reject polling when status request fails', async () => {
    const client = new ModalClient(modalConfig);
    (global.fetch as vi.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: () => Promise.resolve({ detail: 'Boom' }),
    });

    await expect(client.pollJobUntilDone('job-1', () => undefined)).rejects.toThrow('Modal API error');
  });
});
