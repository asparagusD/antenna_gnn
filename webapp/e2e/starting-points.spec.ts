import { expect, test } from '@playwright/test';
import { startingPoint } from './helpers';

// Starting points (top bar) and Clear (board tools) on the 25×25 board (625 pixels, 65 seed pixels).
test('the app opens on a functioning example; Random, Example, Clear and Undo work', async ({ page }) => {
  await page.goto('./');
  const board = page.getByRole('application', { name: /25 by 25 pixels/ });
  const tools = page.getByRole('toolbar', { name: 'Board tools' });
  await expect(board).toHaveAttribute('data-metal-count', '438'); // fixture 25x25-rand-fill70
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await expect(page.locator('[data-result="functioning"]')).toHaveText('Yes');
  await expect(page.locator('.fill-meter-warning')).toBeEmpty();

  await startingPoint(page, 'Random antenna');
  await expect(board).toHaveAttribute('data-metal-count', String(Math.round(0.6 * 625))); // 375
  await expect(page.getByRole('meter', { name: 'Metal fill' })).toContainText('60.0%');

  await page.getByRole('button', { name: 'Starting points' }).click();
  await page.getByRole('slider', { name: 'Random fill' }).fill('30');
  await page.getByRole('button', { name: 'Random antenna' }).click();
  await expect(board).toHaveAttribute('data-metal-count', String(Math.round(0.3 * 625))); // 188

  await tools.getByRole('button', { name: 'Clear' }).click();
  await expect(board).toHaveAttribute('data-metal-count', '65');
  await expect(tools.getByRole('button', { name: 'Clear' })).toBeDisabled();
  await tools.getByRole('button', { name: 'Undo' }).click();
  await expect(board).toHaveAttribute('data-metal-count', '188');

  await startingPoint(page, 'Example antenna');
  await expect(board).toHaveAttribute('data-metal-count', '438');
});

test('the board column is at least 500 px at 1440×900 with one tool row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  const canvas = await page
    .getByRole('application', { name: /Metal pattern/ })
    .locator('canvas')
    .boundingBox();
  expect(canvas?.width ?? 0).toBeGreaterThanOrEqual(480);
  const tools = await page.getByRole('toolbar', { name: 'Board tools' }).boundingBox();
  expect(tools?.height ?? 99).toBeLessThan(44);
  // The fill meter and its warning stay in the first viewport.
  const warning = await page.locator('.fill-meter-warning').boundingBox();
  expect((warning?.y ?? 0) + (warning?.height ?? 0)).toBeLessThanOrEqual(900);
});
