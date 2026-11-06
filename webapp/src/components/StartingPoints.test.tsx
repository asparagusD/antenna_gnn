import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartingPoints } from './StartingPoints';

function setup() {
  const onRandom = vi.fn();
  render(<StartingPoints onRandom={onRandom} />);
  const toggle = () => screen.getByRole('button', { name: 'Starting points' });
  return { onRandom, toggle };
}

describe('StartingPoints', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(cleanup);

  it('is a closed disclosure until pressed', () => {
    const { toggle } = setup();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Random antenna' })).toBeNull();
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('group', { name: 'Starting points' })).toBeDefined();
  });

  it('the fill slider defaults to 60% and spans the 30–80% training range', () => {
    const { toggle } = setup();
    fireEvent.click(toggle());
    const slider = screen.getByRole('slider', { name: 'Random fill' });
    expect(slider.getAttribute('min')).toBe('30');
    expect(slider.getAttribute('max')).toBe('80');
    expect((slider as HTMLInputElement).value).toBe('60');
    expect(slider.getAttribute('aria-valuetext')).toBe('60% metal');
    expect(screen.getByText('60%')).toBeDefined();
    // The visible value is not a second live/status region; the slider's valuetext speaks it.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Random antenna uses the slider fill, closes the panel and returns focus to the toggle', () => {
    const { onRandom, toggle } = setup();
    fireEvent.click(toggle());
    fireEvent.change(screen.getByRole('slider', { name: 'Random fill' }), { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: 'Random antenna' }));
    expect(onRandom).toHaveBeenCalledWith(0.35);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());
    // The fill is remembered for next time.
    fireEvent.click(toggle());
    expect(screen.getByRole<HTMLInputElement>('slider', { name: 'Random fill' }).value).toBe('35');
  });

  it('Escape and a press outside close it', () => {
    const { toggle } = setup();
    fireEvent.click(toggle());
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Random fill' }), { key: 'Escape' });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());
    fireEvent.click(toggle());
    fireEvent.pointerDown(document.body);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
});
