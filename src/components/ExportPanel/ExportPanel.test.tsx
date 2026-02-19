import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportPanel } from './ExportPanel';
import { useAppContext, AppContextValue } from '../../context/AppContext';

// Mock useAppContext
vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

describe('ExportPanel Component', () => {
  const mockExportDataset = vi.fn();

  const mockState = {
    cleanedSamples: [
      { conversations: [{ from: 'human', value: 'hi' }, { from: 'gpt', value: 'hello' }] },
      { conversations: [{ from: 'human', value: 'bye' }, { from: 'gpt', value: 'see ya' }] }
    ],
    processedMessages: [],
    targetUser: 'Alice',
    platform: 'telegram',
    filterConfig: {}
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as vi.Mock).mockReturnValue({
      state: mockState,
      actions: {
        exportDataset: mockExportDataset,
      },
    } as unknown as AppContextValue);
  });

  it('renders correctly with samples', () => {
    render(<ExportPanel />);
    expect(screen.getByText(/Export Dataset/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Samples/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/Export & Download/i)).toBeInTheDocument();
  });

  it('calls exportDataset when button is clicked', () => {
    render(<ExportPanel />);
    fireEvent.click(screen.getByText(/Export & Download/i));
    expect(mockExportDataset).toHaveBeenCalled();
  });

  it('shows empty state (0 samples) when no data present', () => {
    (useAppContext as vi.Mock).mockReturnValue({
      state: { ...mockState, cleanedSamples: [], processedMessages: [] },
      actions: {
        exportDataset: mockExportDataset,
      },
    } as unknown as AppContextValue);

    render(<ExportPanel />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText(/Export & Download/i)).toBeDisabled();
  });
});
