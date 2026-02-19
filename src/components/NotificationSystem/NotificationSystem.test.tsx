import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NotificationSystem from './NotificationSystem';
import { useAppContext, AppContextValue } from '../../context/AppContext';

vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

describe('NotificationSystem', () => {
  const removeNotification = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as vi.Mock).mockReturnValue({
      state: {
        notifications: [
          {
            id: 'n1',
            type: 'error',
            title: 'Error title',
            message: 'Error message',
            timestamp: new Date(),
          },
        ],
      },
      actions: {
        removeNotification,
      },
    } as unknown as AppContextValue);
  });

  it('renders notifications and allows dismiss', () => {
    render(<NotificationSystem />);

    expect(screen.getByText('Error title')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Close notification/i }));
    expect(removeNotification).toHaveBeenCalledWith('n1');
  });
});
