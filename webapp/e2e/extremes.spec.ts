import { expect, test, type Page } from '@playwright/test';
import { analyse } from '../src/core/analysis';
import type { TestHook } from '../src/testHook';

// C6.4 long numbers: extreme synthetic curves (shown through the e2e test hook) must not clip or overflow.
const freq = Array.from({ length: 201 }, (_, k) => 1 + (k * 3) / 200);
const dip = (k: number, at: number, depth: number, width: number) =>
  (depth + 1) * Math.exp(-(((k - at) / width) ** 2));
/** −95 dB at 1.3 GHz, −40 dB at 2.5 GHz, and a band at 3.85 GHz still below −10 dB at 4 GHz (clipped). */
const EXTREME = freq.map((_, k) => -1 + dip(k, 20, -95, 3) + dip(k, 100, -40, 4) + dip(k, 190, -30, 10));

async function show(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('./');
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await page.waitForFunction(() => window.__graphpatchTest !== undefined);
  await page.evaluate((db) => {
    (window.__graphpatchTest as TestHook).setCurve(db);
  }, EXTREME);
}

test('the extreme curve really has three bands, one clipped at 4 GHz', () => {
  const a = analyse(Float64Array.from(EXTREME));
  expect(a.bands).toHaveLength(3);
  expect(a.minDb).toBeLessThan(-90);
  expect(a.bands.some((b) => b.clippedHigh)).toBe(true);
});

for (const width of [375, 1440]) {
  test(`${String(width)} px: deep, multi-band and clipped values fit without overflow`, async ({ page }) => {
    await show(page, width);
    await expect(page.locator('[data-result="depth"]')).toHaveText('−95.0 dB');
    await expect(page.locator('[data-result="bands"]')).toHaveText('3');
    await expect(page.getByRole('region', { name: 'Bands below −10 dB' })).toContainText('≥');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    const clipped = await page
      .locator('.results-value, .summary-value, .s11-chart-title')
      .evaluateAll((els) =>
        els
          .filter((el) => el.getClientRects().length > 0 && el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent),
      );
    expect(clipped).toEqual([]);
    // The −95 dB minimum label stays inside the chart.
    const svg = await page.locator('.s11-chart-svg').boundingBox();
    const label = await page.locator('.s11-min text').boundingBox();
    expect((label?.x ?? -1) >= (svg?.x ?? 0) - 1).toBe(true);
    expect((label?.x ?? 0) + (label?.width ?? 0) <= (svg?.x ?? 0) + (svg?.width ?? 0) + 1).toBe(true);
    expect((label?.y ?? 0) + (label?.height ?? 0) <= (svg?.y ?? 0) + (svg?.height ?? 0) + 1).toBe(true);
  });
}
