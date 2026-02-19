import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import TargetUserSelector from './TargetUserSelector';
import { useAppContext, AppContextValue } from '../../context/AppContext';

// Mock useAppContext
vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('TargetUserSelector Component', () => {
  const mockSetTargetUser = vi.fn();
  const mockState = {
    participants: ['Alice', 'Bob'],
    targetUser: null,
    rawMessages: [
      { sender: 'Alice', text: 'Hey', timestamp: new Date() },
      { sender: 'Alice', text: 'How are you?', timestamp: new Date() },
      { sender: 'Bob', text: 'Hello', timestamp: new Date() },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as vi.Mock).mockReturnValue({
      state: mockState,
      actions: { setTargetUser: mockSetTargetUser },
    } as unknown as AppContextValue);
  });

  it('renders participant list correctly', () => {
    render(
      <BrowserRouter>
        <TargetUserSelector />
      </BrowserRouter>
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Check message counts (Alice: 2, Bob: 1)
    expect(screen.getByText(/2 messages/i)).toBeInTheDocument();
    expect(screen.getByText(/1 message$/i)).toBeInTheDocument();
  });

  it('calls setTargetUser when a participant is clicked', () => {
    render(
      <BrowserRouter>
        <TargetUserSelector />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByText('Alice'));
    expect(mockSetTargetUser).toHaveBeenCalledWith('Alice');
  });

  it('navigates to /clean when continue is clicked and user is selected', () => {
    (useAppContext as vi.Mock).mockReturnValue({
      state: { ...mockState, targetUser: 'Alice' },
      actions: { setTargetUser: mockSetTargetUser },
    } as unknown as AppContextValue);

    render(
      <BrowserRouter>
        <TargetUserSelector />
      </BrowserRouter>
    );

    const continueBtn = screen.getByText(/^Continue$/i);
    fireEvent.click(continueBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/clean');
  });

  it('disables continue button if no user is selected', () => {
    render(
      <BrowserRouter>
        <TargetUserSelector />
      </BrowserRouter>
    );

    const continueBtn = screen.getByText(/^Continue$/i);
    expect(continueBtn).toBeDisabled();
  });
});

