import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AIProcessing } from './AIProcessing';
import { useAppContext, AppContextValue } from '../../context/AppContext';

// Mock useAppContext
vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

describe('AIProcessing Component', () => {
  const mockStartCleaning = vi.fn();
  const mockCancelCleaning = vi.fn();
  const mockAnalyzeStyle = vi.fn();
  const mockAuditQuality = vi.fn();

  const mockState = {
    isCleaningActive: false,
    cleaningProgress: 0,
    cleanedSamples: [],
    styleAnalysis: null,
    qualityReport: null,
    processedMessages: [{ id: '1', text: 'hello' }],
    targetUser: 'Alice',
    aiConfig: { provider: 'gemini', model: 'gemini-1.5-flash', apiKey: 'test' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as vi.Mock).mockReturnValue({
      state: mockState,
      actions: {
        startCleaning: mockStartCleaning,
        cancelCleaning: mockCancelCleaning,
        analyzeStyle: mockAnalyzeStyle,
        auditQuality: mockAuditQuality,
      },
    } as unknown as AppContextValue);
  });

  it('renders initial state correctly', () => {
    render(<AIProcessing />);
    expect(screen.getByText(/AI Data Cleaning/i)).toBeInTheDocument();
    expect(screen.getByText(/Start Cleaning/i)).toBeInTheDocument();
  });

  it('triggers startCleaning when button is clicked', () => {
    render(<AIProcessing />);
    fireEvent.click(screen.getByText(/Start Cleaning/i));
    expect(mockStartCleaning).toHaveBeenCalled();
  });

  it('shows progress and cancel button when cleaning is active', () => {
    (useAppContext as vi.Mock).mockReturnValue({
      state: { ...mockState, isCleaningActive: true, cleaningProgress: 45 },
      actions: {
        startCleaning: mockStartCleaning,
        cancelCleaning: mockCancelCleaning,
        analyzeStyle: mockAnalyzeStyle,
        auditQuality: mockAuditQuality,
      },
    } as unknown as AppContextValue);

    render(<AIProcessing />);
    // Check for progress bar (div with width)
    const progressBarFill = document.querySelector('.progress-bar-fill');
    expect(progressBarFill).toBeInTheDocument();
    expect(progressBarFill).toHaveStyle('width: 45%');
    expect(screen.getByText(/Cancel/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Cancel/i));
    expect(mockCancelCleaning).toHaveBeenCalled();
  });

  it('shows results and analysis buttons when samples are ready', () => {
    (useAppContext as vi.Mock).mockReturnValue({
      state: { ...mockState, cleanedSamples: [{ conversations: [] }] },
      actions: {
        startCleaning: mockStartCleaning,
        cancelCleaning: mockCancelCleaning,
        analyzeStyle: mockAnalyzeStyle,
        auditQuality: mockAuditQuality,
      },
    } as unknown as AppContextValue);

    render(<AIProcessing />);
    expect(screen.getByText(/samples generated/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analyze Style/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run Audit/i })).toBeInTheDocument();
  });
});
