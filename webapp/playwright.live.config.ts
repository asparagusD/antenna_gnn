import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright against a deployed copy of the app (C7.2): no local server. LIVE_URL selects the site
 * (default: the GitHub Pages deployment); it must end with "/".
 *   npx playwright test -c playwright.live.config.ts
 *   LIVE_URL=http://localhost:4173/antenna_gnn/ npx playwright test -c playwright.live.config.ts
 */
const LIVE_URL = process.env.LIVE_URL ?? 'https://asparagusd.github.io/antenna_gnn/';
if (!LIVE_URL.endsWith('/')) throw new Error(`LIVE_URL must end with "/", got ${LIVE_URL}`);

export default defineConfig({
  testDir: 'e2e-live',
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: 'list',
  use: { baseURL: LIVE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
