import { expect, test } from '@playwright/test';

// Layout regressions (C6). Tall viewports must not squeeze the results column.
for (const [width, height] of [
  [768, 1024],
  [820, 1180],
  [1024, 1366],
] as const) {
  test(`portrait ${String(width)}×${String(height)}: columns stack, no sideways scroll, readable chart`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    const chart = await page.locator('.s11-chart-svg').boundingBox();
    expect(chart?.width ?? 0).toBeGreaterThan(width * 0.8);
    // The chart sits below the board when stacked.
    const board = await page.getByRole('application', { name: /Metal pattern/ }).boundingBox();
    expect((chart?.y ?? 0) > (board?.y ?? 0) + (board?.height ?? 0)).toBe(true);
    // No results cell overflows its box.
    const clipped = await page
      .locator('.results-value')
      .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
    expect(clipped).toBe(0);
  });
}

test('landscape 1024×768 keeps two columns', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('./');
  const board = await page.getByRole('application', { name: /Metal pattern/ }).boundingBox();
  const chart = await page.locator('.s11-chart-svg').boundingBox();
  expect((chart?.x ?? 0) > (board?.x ?? 0) + (board?.width ?? 0)).toBe(true);
});

test('200% text (WCAG 1.4.4): no sideways scroll and no clipped or overlapping result values', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./');
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  const clipped = await page
    .locator('.results-value')
    .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);
});
