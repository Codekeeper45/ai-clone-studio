import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatasetManager } from './DatasetManager';
import { useAppContext, AppContextValue } from '../../context/AppContext';

const mockListDatasets = vi.fn();
const mockExportAllData = vi.fn();
const mockImportData = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

vi.mock('../../services/StorageManager', () => ({
  StorageManager: class {
    listDatasets = mockListDatasets;
    exportAllData = mockExportAllData;
    importData = mockImportData;
  },
}));

describe('DatasetManager', () => {
  const mockActions = {
    addNotification: vi.fn(),
    saveDataset: vi.fn(),
    loadDataset: vi.fn(),
    deleteDataset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListDatasets.mockResolvedValue([]);
    (useAppContext as vi.Mock).mockReturnValue({
      actions: mockActions,
    } as unknown as AppContextValue);
  });

  it('renders empty state when no datasets exist', async () => {
    render(<DatasetManager />);

    await waitFor(() => {
      expect(screen.getByText('No saved datasets')).toBeInTheDocument();
    });
  });

  it('loads selected dataset when Load is clicked', async () => {
    mockListDatasets.mockResolvedValue([
      {
        id: 'ds-1',
        name: 'My Dataset',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        messageCount: 12,
        targetUser: 'Alice',
      },
    ]);

    render(<DatasetManager />);

    const loadButton = await screen.findByRole('button', { name: /Load/i });
    fireEvent.click(loadButton);

    expect(mockActions.loadDataset).toHaveBeenCalledWith('ds-1');
  });
});
