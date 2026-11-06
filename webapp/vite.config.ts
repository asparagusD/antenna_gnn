import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Base path for every asset URL. Local development serves from "/"; the GitHub Pages build sets
 * BASE_PATH=/antenna_gnn/ (the repository name), so model and fixture URLs must be built from
 * import.meta.env.BASE_URL, never hard-coded.
 */
export function basePath(value: string | undefined): string {
  const base = value === undefined || value === '' ? '/' : value;
  if (!base.startsWith('/') || !base.endsWith('/')) {
    throw new Error(`BASE_PATH must start and end with "/", got "${base}"`);
  }
  return base;
}

export default defineConfig({
  base: basePath(process.env.BASE_PATH),
  plugins: [react()],
});
