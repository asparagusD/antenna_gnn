import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeToggle, THEME_KEY } from './ThemeToggle';

describe('ThemeToggle', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('cycles System -> Light -> Dark -> System, setting data-theme on <html>', () => {
    render(<ThemeToggle />);
    const button = () => screen.getByRole('button', { name: /^Theme:/ });
    expect(button().textContent).toBe('Theme: System');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    fireEvent.click(button());
    expect(button().textContent).toBe('Theme: Light');
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(button());
    expect(button().textContent).toBe('Theme: Dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(button());
    expect(button().textContent).toBe('Theme: System');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('remembers the choice for this viewer', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /^Theme:/ }).textContent).toBe('Theme: Dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
