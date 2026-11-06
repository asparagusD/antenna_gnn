import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatternTools } from './PatternTools';

function setup(edited = true) {
  const onRandom = vi.fn();
  const onClear = vi.fn();
  render(<PatternTools edited={edited} onRandom={onRandom} onClear={onClear} />);
  return { onRandom, onClear };
}

describe('PatternTools', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(cleanup);

  it('the fill slider defaults to 60% and spans the 30–80% training range', () => {
    setup();
    const slider = screen.getByRole('slider', { name: 'Random fill' });
    expect(slider.getAttribute('min')).toBe('30');
    expect(slider.getAttribute('max')).toBe('80');
    expect((slider as HTMLInputElement).value).toBe('60');
    expect(slider.getAttribute('aria-valuetext')).toBe('60% metal');
    expect(screen.getByText('60%')).toBeDefined();
  });

  it('Random antenna asks for a pattern at the slider fill', () => {
    const { onRandom } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Random antenna' }));
    expect(onRandom).toHaveBeenCalledWith(0.6);
    fireEvent.change(screen.getByRole('slider', { name: 'Random fill' }), { target: { value: '35' } });
    expect(screen.getByText('35%')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Random antenna' }));
    expect(onRandom).toHaveBeenLastCalledWith(0.35);
  });

  it('Clear resets to the seed pixels, and is disabled when there is nothing to clear', () => {
    const { onClear } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    cleanup();
    setup(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Clear' }).disabled).toBe(true);
  });
});
