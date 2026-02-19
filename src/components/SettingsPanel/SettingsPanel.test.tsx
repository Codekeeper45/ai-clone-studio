import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { useAppContext, AppContextValue } from '../../context/AppContext';
import { DEFAULT_AI_CONFIG, DEFAULT_MODAL_CONFIG } from '../../types';

// Mock useAppContext
vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

describe('SettingsPanel Component', () => {
  const mockUpdateAIConfig = vi.fn();
  const mockUpdateModalConfig = vi.fn();
  const mockAddNotification = vi.fn();

  const mockState = {
    aiConfig: DEFAULT_AI_CONFIG,
    modalConfig: DEFAULT_MODAL_CONFIG,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(window, 'crypto', {
      value: { subtle: {} },
      configurable: true,
    });
    window.confirm = vi.fn().mockReturnValue(true);

    (useAppContext as vi.Mock).mockReturnValue({
      state: mockState,
      actions: {
        updateAIConfig: mockUpdateAIConfig,
        updateModalConfig: mockUpdateModalConfig,
        addNotification: mockAddNotification,
      },
    } as unknown as AppContextValue);

    // Mock fetch for model list
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' }] }),
    });
  });

  it('renders settings sections correctly', () => {
    render(<SettingsPanel />);
    expect(screen.getByText(/AI Configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/Modal.com Configuration/i)).toBeInTheDocument();
  });

  it('updates and saves AI settings', async () => {
    render(<SettingsPanel />);

    const apiKeyInput = screen.getByPlaceholderText(/Enter your Google AI API key/i);
    fireEvent.change(apiKeyInput, { target: { value: 'test-api-key' } });

    const saveBtn = screen.getByText(/Save AI Settings/i);
    fireEvent.click(saveBtn);

    expect(mockUpdateAIConfig).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-api-key'
    }));
    expect(mockAddNotification).toHaveBeenCalledWith('success', expect.anything(), expect.anything());
  });

  it('updates and saves Modal settings', () => {
    render(<SettingsPanel />);

    const tokenIdInput = screen.getByPlaceholderText('ak-...');
    fireEvent.change(tokenIdInput, { target: { value: 'my-token-id' } });

    const endpointInput = screen.getByPlaceholderText(/your-workspace--ai-clone-studio-api/i);
    fireEvent.change(endpointInput, { target: { value: 'https://test.modal.run' } });

    const saveBtn = screen.getByText(/Save Modal Settings/i);
    fireEvent.click(saveBtn);

    expect(mockUpdateModalConfig).toHaveBeenCalledWith(expect.objectContaining({
      tokenId: 'my-token-id',
      endpoint: 'https://test.modal.run'
    }));
  });

  it('normalizes OpenAI endpoint on save', () => {
    render(<SettingsPanel />);

    fireEvent.change(screen.getByLabelText(/AI Provider/i), { target: { value: 'openai' } });
    fireEvent.change(screen.getByLabelText(/API Key/i), { target: { value: 'sk-test' } });
    fireEvent.change(screen.getByLabelText(/Provider endpoint URL/i), {
      target: { value: '127.0.0.1:8045/v1' },
    });

    fireEvent.click(screen.getByText(/Save AI Settings/i));

    expect(mockUpdateAIConfig).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: 'http://127.0.0.1:8045/v1',
      provider: 'openai',
    }));
  });

  it('fetches models when Fetch button is clicked', async () => {
    (useAppContext as vi.Mock).mockReturnValue({
      state: {
        ...mockState,
        aiConfig: { ...DEFAULT_AI_CONFIG, apiKey: 'valid-key' }
      },
      actions: {
        updateAIConfig: mockUpdateAIConfig,
        updateModalConfig: mockUpdateModalConfig,
        addNotification: mockAddNotification,
      },
    } as unknown as AppContextValue);

    render(<SettingsPanel />);

    const fetchBtn = screen.getByRole('button', { name: /Fetch/i });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
