import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { TestHook } from '../src/testHook';

// C6.2: axe-core WCAG 2.1 A/AA checks across the app's states, in both themes.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function ready(page: Page) {
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`),
  }));
}

const twoBand = (
  JSON.parse(readFileSync(new URL('../fixtures/analysis/band_vectors.json', import.meta.url), 'utf8')) as {
    vectors: { db: number[]; bands: number[] }[];
  }
).vectors.find((v) => v.bands.length === 2);

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('loaded app (example antenna, results, band table)', async ({ page }) => {
      await page.goto('./');
      await ready(page);
      expect(await violations(page)).toEqual([]);
    });

    test('Starting points panel and grid-size question open', async ({ page }) => {
      await page.goto('./');
      await ready(page);
      await page.getByRole('button', { name: 'Starting points' }).click();
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Clear' }).click();
      await page.getByRole('group', { name: 'Grid size' }).getByRole('button', { name: '35×35' }).click();
      await expect(page.getByRole('group', { name: 'Switch to 35×35?' })).toBeVisible();
      // Scan a settled page: "Updating…" fades in over 150 ms, and a mid-fade sample is not its contrast.
      await ready(page);
      expect(await violations(page)).toEqual([]);
    });

    test('share-link error, fill warning and scope notice', async ({ page }) => {
      await page.goto('./#p=v1.25.AAAA');
      await ready(page);
      await page.getByRole('button', { name: 'Clear' }).click(); // seeds only: fill warning
      await page.waitForFunction(() => window.__graphpatchTest !== undefined);
      await page.evaluate((db) => {
        (window.__graphpatchTest as TestHook).setCurve(db);
      }, twoBand?.db ?? []);
      await expect(page.getByRole('note')).toBeVisible();
      await expect(page.getByRole('alert')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}

for (const [width, height] of [
  [768, 1024],
  [375, 812],
] as const) {
  test(`stacked layout ${String(width)}×${String(height)}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await ready(page);
    expect(await violations(page)).toEqual([]);
  });
}
