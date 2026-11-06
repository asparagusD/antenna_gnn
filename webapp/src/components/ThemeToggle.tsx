/**
 * Theme toggle (approved shape: top bar). One button cycles System -> Light -> Dark. "System" follows
 * prefers-color-scheme; Light and Dark set data-theme on <html>, which tokens.css honours and the board's
 * canvas observes for a redraw. The choice is remembered per viewer in localStorage (best effort: private
 * windows may refuse it, and the app works without it).
 */
import { useEffect, useState } from 'react';

export const THEME_KEY = 'graphpatch.theme';
type Theme = 'system' | 'light' | 'dark';
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

function stored(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(stored);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage unavailable (private window, blocked site data): the theme still applies for this visit.
    }
  }, [theme]);

  return (
    <button
      type="button"
      className="tool theme-toggle"
      onClick={() => {
        setTheme((t) => NEXT[t]);
      }}
    >
      {`Theme: ${LABEL[theme]}`}
    </button>
  );
}
