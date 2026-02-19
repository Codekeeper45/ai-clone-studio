import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { AppProvider } from './AppProvider';
import { useAppContext, AppContextValue } from './AppContext';
import { DEFAULT_TRAINING_CONFIG } from '../types';

const mockStartTraining = vi.fn();
const mockPollJobUntilDone = vi.fn();

vi.mock('../services/ModalClient', () => ({
  ModalClient: class {
    startTraining = mockStartTraining;
    pollJobUntilDone = mockPollJobUntilDone;
    cancelTraining = vi.fn();
    stopAll = vi.fn();
  },
}));

vi.mock('../services/ShareGPTExporter', () => ({
  ShareGPTExporter: class {
    generateJSONL() {
      return '{"conversations":[]}';
    }
    convertToShareGPT() {
      return [];
    }
    addMetadata = vi.fn();
    downloadFile = vi.fn();
    static generateFilename() {
      return 'dataset.jsonl';
    }
  },
}));

describe('AppProvider training error handling', () => {
  let latestContext: AppContextValue | null = null;

  function ContextCapture({ onUpdate }: { onUpdate: (ctx: AppContextValue) => void }) {
    const ctx = useAppContext();
    useEffect(() => {
      onUpdate(ctx);
    }, [ctx, onUpdate]);
    return null;
  }

  beforeEach(() => {
    latestContext = null;
    vi.clearAllMocks();
    mockStartTraining.mockResolvedValue('job-1');
    mockPollJobUntilDone.mockRejectedValue(new Error('Network down while polling'));
  });

  it('marks job as failed when polling rejects', async () => {
    render(
      <AppProvider>
        <ContextCapture onUpdate={(ctx) => { latestContext = ctx; }} />
      </AppProvider>
    );

    await waitFor(() => {
      expect(latestContext).not.toBeNull();
    });

    act(() => {
      latestContext!.actions.updateModalConfig({
        tokenId: 'ak-test',
        tokenSecret: 'as-test',
        workspace: 'ws',
        gpu: 'A10G',
        endpoint: 'https://example.modal.run',
      });
    });

    await act(async () => {
      await latestContext!.actions.startTraining(DEFAULT_TRAINING_CONFIG);
    });

    await waitFor(() => {
      const job = latestContext!.state.trainingJobs[0];
      expect(job).toBeDefined();
      expect(job.status).toBe('failed');
      expect(job.error).toContain('Network down');
    });
  });
});
