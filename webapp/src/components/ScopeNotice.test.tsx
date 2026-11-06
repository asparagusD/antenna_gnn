import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScopeNotice, SCOPE_TEXT } from './ScopeNotice';

describe('ScopeNotice', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(cleanup);

  it.each([0, 1])('is empty for %i band(s), with its polite live region already mounted', (bands) => {
    const { container } = render(<ScopeNotice bands={bands} N={35} />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe('');
  });

  it.each([12, 15, 35, 45])('shows the single-band training text on %i×%i for 2+ bands', (N) => {
    render(<ScopeNotice bands={2} N={N} />);
    expect(screen.getByText(SCOPE_TEXT)).toBeDefined();
  });

  it('on 25×25 adds that this grid also saw multi-band antennas in training', () => {
    render(<ScopeNotice bands={3} N={25} />);
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('This prediction shows more than one band.');
    expect(note.textContent).toContain('25×25');
    expect(note.textContent).toContain('multi-band');
  });

  it('appears inside the same live region, so it is announced', () => {
    const { container, rerender } = render(<ScopeNotice bands={1} N={35} />);
    const live = container.querySelector('[aria-live="polite"]');
    rerender(<ScopeNotice bands={2} N={35} />);
    expect(container.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live?.textContent).toContain(SCOPE_TEXT);
  });
});
