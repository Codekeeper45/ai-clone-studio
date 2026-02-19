import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FileUpload from './FileUpload';
import { useAppContext, AppContextValue } from '../../context/AppContext';

// Mock useAppContext
vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

describe('FileUpload Component', () => {
  const mockImportFile = vi.fn();
  const mockState = {
    isLoading: false,
    rawMessages: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as vi.Mock).mockReturnValue({
      state: mockState,
      actions: { importFile: mockImportFile },
    } as unknown as AppContextValue);
  });

  it('renders correctly in empty state', () => {
    render(<FileUpload />);
    expect(screen.getByText(/Drop your chat export here/i)).toBeInTheDocument();
    expect(screen.getByText(/or click to browse/i)).toBeInTheDocument();
  });

  it('triggers importFile when a file is selected', async () => {
    render(<FileUpload />);
    const file = new File(['{"messages":[]}'], 'chat.json', { type: 'application/json' });
    // The input is hidden with display: none, so we find it by its type
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    if (!input) throw new Error('File input not found');

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockImportFile).toHaveBeenCalledWith(file);
    });
  });

  it('shows success state (stats) when rawMessages are present', () => {
    (useAppContext as vi.Mock).mockReturnValue({
      state: {
        ...mockState,
        rawMessages: [{ id: '1', timestamp: new Date(), sender: 'Alice', text: 'hi', type: 'text' }],
        participants: ['Alice'],
        platform: 'telegram'
      },
      actions: { importFile: mockImportFile },
    } as unknown as AppContextValue);

    render(<FileUpload />);
    expect(screen.getByText(/Total Messages/i)).toBeInTheDocument();
    // Use getAllByText and check that we have '1' in the stats area
    const values = screen.getAllByText('1');
    expect(values.length).toBeGreaterThanOrEqual(1);
  });
});
