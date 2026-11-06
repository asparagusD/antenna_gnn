import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GridSizeSelector } from './GridSizeSelector';

const SIZES = [12, 15, 25, 35, 45];

function setup(edited: boolean) {
  const onChange = vi.fn();
  render(<GridSizeSelector sizes={SIZES} value={25} edited={edited} onChange={onChange} />);
  const size = (n: number) => screen.getByRole('button', { name: `${String(n)}×${String(n)}` });
  return { onChange, size };
}

describe('GridSizeSelector', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(cleanup);

  it('offers exactly 12, 15, 25, 35 and 45 with the current size pressed', () => {
    setup(false);
    const group = screen.getByRole('group', { name: 'Grid size' });
    const buttons = Array.from(group.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['12×12', '15×15', '25×25', '35×35', '45×45']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
    ]);
  });

  it('changes size at once when the pattern has no edits', () => {
    const { onChange, size } = setup(false);
    fireEvent.click(size(35));
    expect(onChange).toHaveBeenCalledWith(35);
    expect(screen.queryByRole('group', { name: /Switch to/ })).toBeNull();
  });

  it('does nothing when the current size is chosen again', () => {
    const { onChange, size } = setup(true);
    fireEvent.click(size(25));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: /Switch to/ })).toBeNull();
  });

  it('asks first when the pattern has edits, and switches only on confirmation', () => {
    const { onChange, size } = setup(true);
    fireEvent.click(size(35));
    expect(onChange).not.toHaveBeenCalled();
    const confirm = screen.getByRole('group', { name: 'Switch to 35×35?' });
    expect(confirm.textContent).toContain('Your 25×25 edits will be cleared');
    const go = screen.getByRole('button', { name: 'Switch to 35×35' });
    expect(document.activeElement).toBe(go);
    fireEvent.click(go);
    expect(onChange).toHaveBeenCalledWith(35);
  });

  it('Keep and Escape cancel without changing size, returning focus to the chosen size', () => {
    const { onChange, size } = setup(true);
    fireEvent.click(size(12));
    fireEvent.click(screen.getByRole('button', { name: 'Keep 25×25' }));
    expect(screen.queryByRole('group', { name: /Switch to/ })).toBeNull();
    expect(document.activeElement).toBe(size(12));

    fireEvent.click(size(45));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Switch to 45×45' }), { key: 'Escape' });
    expect(screen.queryByRole('group', { name: /Switch to/ })).toBeNull();
    expect(document.activeElement).toBe(size(45));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a second size chosen while asking replaces the question', () => {
    const { size } = setup(true);
    fireEvent.click(size(12));
    fireEvent.click(size(45));
    expect(screen.queryByRole('group', { name: 'Switch to 12×12?' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Switch to 45×45?' })).toBeDefined();
  });
});
