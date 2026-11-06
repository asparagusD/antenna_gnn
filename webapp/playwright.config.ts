import { defineConfig, devices } from '@playwright/test';

// The smoke test runs against the production build (vite preview), under the same base path the
// deployment uses when BASE_PATH is set (e.g. BASE_PATH=/antenna_gnn/ for GitHub Pages).
const PORT = 4173;
const base = process.env.BASE_PATH ?? '/';
const isCI = process.env.CI !== undefined;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${base}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${base}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
