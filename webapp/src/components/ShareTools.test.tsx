import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareTools } from './ShareTools';

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('ShareTools', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('copies the current page URL and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    render(<ShareTools pattern="p=v1.25.A" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByText('Link copied. It restores this exact pattern.')).toBeDefined();
  });

  it('when copying fails, points to the address bar instead', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    render(<ShareTools pattern="p=v1.25.A" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Could not copy. The address bar holds the share link.')).toBeDefined();
  });

  it('the confirmation goes away once the pattern changes (it would no longer be true)', async () => {
    stubClipboard(() => Promise.resolve());
    const { rerender } = render(<ShareTools pattern="p=v1.25.A" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Link copied. It restores this exact pattern.')).toBeDefined();
    rerender(<ShareTools pattern="p=v1.25.B" />);
    expect(screen.queryByText(/Link copied/)).toBeNull();
  });

  it('announces the outcome politely', () => {
    const { container } = render(<ShareTools pattern="p=v1.25.A" />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
