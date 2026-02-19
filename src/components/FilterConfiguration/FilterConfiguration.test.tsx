import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterConfiguration from './FilterConfiguration';
import { useAppContext, AppContextValue } from '../../context/AppContext';
import { DEFAULT_FILTER_CONFIG } from '../../types';

// Mock useAppContext
vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

describe('FilterConfiguration Component', () => {
  const mockApplyFilters = vi.fn();
  const mockState = {
    filterConfig: DEFAULT_FILTER_CONFIG,
    rawMessages: [],
    processedMessages: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as vi.Mock).mockReturnValue({
      state: mockState,
      actions: { applyFilters: mockApplyFilters },
    } as unknown as AppContextValue);
  });

  it('renders correctly with default values', () => {
    render(<FilterConfiguration />);

    expect(screen.getByText(/Filter Configuration/i)).toBeInTheDocument();

    const minLengthInput = screen.getByLabelText(/Minimum Message Length/i) as HTMLInputElement;
    expect(minLengthInput.value).toBe(DEFAULT_FILTER_CONFIG.minMessageLength.toString());

    const burstToggle = screen.getByText(/Merge Burst Messages/i);
    expect(burstToggle).toBeInTheDocument();
  });

  it('triggers applyFilters when apply button is clicked', () => {
    render(<FilterConfiguration />);

    const minLengthInput = screen.getByLabelText(/Minimum Message Length/i);
    fireEvent.change(minLengthInput, { target: { value: '20' } });

    const applyBtn = screen.getByText(/Apply Filters/i);
    fireEvent.click(applyBtn);

    expect(mockApplyFilters).toHaveBeenCalledWith(expect.objectContaining({
      minMessageLength: 20
    }));
  });

  it('toggles burst merging correctly', () => {
    render(<FilterConfiguration />);

    const burstToggle = screen.getByText(/Merge Burst Messages/i);
    fireEvent.click(burstToggle);

    const applyBtn = screen.getByText(/Apply Filters/i);
    fireEvent.click(applyBtn);

    expect(mockApplyFilters).toHaveBeenCalledWith(expect.objectContaining({
      mergeBurstMessages: !DEFAULT_FILTER_CONFIG.mergeBurstMessages
    }));
  });

  it('updates lazy patterns via textarea', () => {
    const configWithLazy = { ...DEFAULT_FILTER_CONFIG, filterLazyResponses: true };
    (useAppContext as vi.Mock).mockReturnValue({
      state: { ...mockState, filterConfig: configWithLazy },
      actions: { applyFilters: mockApplyFilters },
    } as unknown as AppContextValue);

    render(<FilterConfiguration />);

    const textarea = screen.getByLabelText(/Lazy Patterns/i);
    fireEvent.change(textarea, { target: { value: 'ok, lol, wow' } });

    const applyBtn = screen.getByText(/Apply Filters/i);
    fireEvent.click(applyBtn);

    expect(mockApplyFilters).toHaveBeenCalledWith(expect.objectContaining({
      lazyPatterns: ['ok', 'lol', 'wow']
    }));
  });
});
