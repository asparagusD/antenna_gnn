import { expect, test, type Locator, type Page } from '@playwright/test';

// C5.3 live chart: editor change -> worker predict (latest wins) -> chart. Runs the real ONNX model in
// the production build.
const N = 25;

async function centre(canvas: Locator, row: number, col: number) {
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('board canvas not visible');
  return { x: box.x + ((col + 0.5) * box.width) / N, y: box.y + ((row + 0.5) * box.height) / N };
}

async function settledCurve(page: Page): Promise<string> {
  const chart = page.locator('figure.s11-chart');
  await expect(chart).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  const d = await page.locator('path.s11-curve').getAttribute('d');
  if (d === null) throw new Error('no curve');
  return d;
}

test('painting changes the predicted curve', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('./');
  const canvas = page.getByRole('application', { name: /25 by 25 pixels/ }).locator('canvas');
  const before = await settledCurve(page);
  await expect(page.locator('path.s11-curve')).toHaveAttribute('d', /^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+){200}$/);
  await expect(page.locator('.s11-reference-label')).toHaveText('−10 dB');
  await expect(page.locator('.s11-min text')).toHaveText(/^−?\d+\.\d dB · \d\.\d{3} GHz$/);

  // Bridge the feed pixel (5, 12) to the seed block (rows 8-15): paint (6, 12) and (7, 12).
  const a = await centre(canvas, 6, 12);
  const b = await centre(canvas, 7, 12);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 2 });
  await page.mouse.up();

  await expect.poll(() => settledCurve(page), { timeout: 30_000 }).not.toBe(before);
  expect(errors).toEqual([]);
});

test('the curve follows undo back to the original prediction', async ({ page }) => {
  await page.goto('./');
  const canvas = page.getByRole('application', { name: /25 by 25 pixels/ }).locator('canvas');
  const before = await settledCurve(page);
  const at = await centre(canvas, 20, 20);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => settledCurve(page), { timeout: 30_000 }).not.toBe(before);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => settledCurve(page), { timeout: 30_000 }).toBe(before);
});
