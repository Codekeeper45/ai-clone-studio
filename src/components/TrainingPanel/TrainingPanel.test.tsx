import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrainingPanel } from './TrainingPanel';
import { useAppContext, AppContextValue } from '../../context/AppContext';
import { TRAINING_MODELS, DEFAULT_TRAINING_CONFIG } from '../../types';

// Mock useAppContext
vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

describe('TrainingPanel Component', () => {
  const mockStartTraining = vi.fn();
  const mockAddNotification = vi.fn();

  const mockState = {
    processedMessages: [{ id: '1', text: 'hello' }],
    modalConfig: {
      tokenId: 'test-id',
      tokenSecret: 'test-secret',
      endpoint: 'https://test.modal.run',
      workspace: 'test',
      gpu: 'A10G'
    },
    trainingJobs: [],
    activeJobId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as vi.Mock).mockReturnValue({
      state: mockState,
      actions: {
        startTraining: mockStartTraining,
        addNotification: mockAddNotification,
      },
    } as unknown as AppContextValue);
  });

  it('renders correctly with model selection', () => {
    render(<TrainingPanel />);
    expect(screen.getByRole('heading', { name: /^Fine-Tuning$/i })).toBeInTheDocument();
    // Check if some models are rendered
    expect(screen.getByText(TRAINING_MODELS[0].name)).toBeInTheDocument();
  });

  it('triggers startTraining when button is clicked', () => {
    render(<TrainingPanel />);
    const startBtn = screen.getByRole('button', { name: /start training/i });
    fireEvent.click(startBtn);
    expect(mockStartTraining).toHaveBeenCalled();
  });

  it('shows warning if Modal is not configured', () => {
    (useAppContext as vi.Mock).mockReturnValue({
      state: { ...mockState, modalConfig: { ...mockState.modalConfig, endpoint: '' } },
      actions: {
        startTraining: mockStartTraining,
        addNotification: mockAddNotification,
      },
    } as unknown as AppContextValue);

    render(<TrainingPanel />);
    expect(screen.getByText(/Modal.com credentials not configured/i)).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /start training/i });
    expect(startBtn).toBeDisabled();
  });

  it('displays active training jobs', () => {
    const mockJob = {
      jobId: 'job-123',
      status: 'running',
      progress: 45,
      config: DEFAULT_TRAINING_CONFIG,
      logs: [{ timestamp: new Date(), level: 'info', message: 'Training started' }],
    };

    (useAppContext as vi.Mock).mockReturnValue({
      state: { ...mockState, trainingJobs: [mockJob] },
      actions: {
        startTraining: mockStartTraining,
        addNotification: mockAddNotification,
      },
    } as unknown as AppContextValue);

    render(<TrainingPanel />);
    expect(screen.getByText(/Training Jobs/i)).toBeInTheDocument();
    expect(screen.getByText('job-123')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText(/Training started/i)).toBeInTheDocument();
  });
});
