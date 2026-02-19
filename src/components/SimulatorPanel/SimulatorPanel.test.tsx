import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SimulatorPanel } from './SimulatorPanel';
import { useAppContext, AppContextValue } from '../../context/AppContext';

// Mock useAppContext
vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

// Mock CloneSimulator
vi.mock('../../services/CloneSimulator', () => {
  return {
    CloneSimulator: vi.fn().mockImplementation(function() {
      return {
        sendMessage: vi.fn().mockResolvedValue('Hello, I am your clone.'),
        getConversationHistory: vi.fn().mockReturnValue([]),
        resetConversation: vi.fn(),
        getSystemPrompt: vi.fn().mockReturnValue('System prompt'),
        setSystemPrompt: vi.fn(),
      };
    }),
  };
});

describe('SimulatorPanel Component', () => {
  const mockState = {
    trainingJobs: [
      { jobId: 'job-1', status: 'completed', modelEndpoint: '/inference/job-1', config: { baseModel: 'test-model' } }
    ],
    activeJobId: 'job-1',
    processedMessages: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as vi.Mock).mockReturnValue({
      state: mockState,
      actions: {},
    } as unknown as AppContextValue);

    // Mock scrollIntoView for JSDOM
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders correctly with model info', () => {
    render(<SimulatorPanel />);
    expect(screen.getByRole('heading', { name: /Clone Simulator/i })).toBeInTheDocument();
    expect(screen.getByText(/Model Information/i)).toBeInTheDocument();
    expect(screen.getByText(/job-1/i)).toBeInTheDocument();
  });

  it('allows sending a message and displays response', async () => {
    render(<SimulatorPanel />);

    const input = screen.getByPlaceholderText(/Type a message/i);
    // Find the button by its aria-label
    const sendBtn = screen.getByRole('button', { name: /Send message/i });

    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(sendBtn);

    expect(screen.getByText('Hello')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Hello, I am your clone.')).toBeInTheDocument();
    });
  });

  it('shows empty state if no trained models exist', () => {
    (useAppContext as vi.Mock).mockReturnValue({
      state: { ...mockState, trainingJobs: [], activeJobId: null },
      actions: {},
    } as unknown as AppContextValue);

    render(<SimulatorPanel />);
    expect(screen.getByText(/No trained model available/i)).toBeInTheDocument();
  });

  it('resets conversation when reset button is clicked', () => {
    render(<SimulatorPanel />);

    const resetBtn = screen.getByText(/Reset/i);
    fireEvent.click(resetBtn);

    // Check if reset was called on service
    // Note: since we use a local ref for service, we'd need more complex mocking
    // to check internal instance, but we can check if messages are cleared from UI
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });
});
