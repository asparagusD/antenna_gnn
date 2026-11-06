import { expect, test } from '@playwright/test';

// C6.4 error states: a browser without WebAssembly, a model file that fails to load, a missing meta.json.

test('a browser without WebAssembly gets a clear message and no Retry', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'WebAssembly');
  });
  await page.goto('./');
  await expect(page.getByRole('status')).toHaveText('This browser cannot run the model');
  await expect(page.locator('.s11-chart-error')).toContainText(
    'This browser cannot run the model: it needs WebAssembly and Web Workers.',
  );
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  // The board still works: the pattern can be edited, shared and exported.
  await expect(page.getByRole('application', { name: /Metal pattern/ })).toBeVisible();
});

test('a model that fails to load says so, and Retry recovers once it is reachable', async ({
  page,
  context,
}) => {
  await context.route('**/model/antenna_gnn.onnx', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  );
  await page.goto('./');
  await expect(page.getByRole('status')).toHaveText('Model failed to load', { timeout: 30_000 });
  await expect(page.locator('.s11-chart-error')).toContainText(
    'The model could not be loaded. Check your connection, then retry.',
  );
  await context.unroute('**/model/antenna_gnn.onnx');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('status')).toHaveText('Model ready · runs in your browser', {
    timeout: 30_000,
  });
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await expect(page.locator('path.s11-curve')).toHaveCount(1);
});

test('a missing meta.json shows a startup error with Reload instead of an empty page', async ({ page }) => {
  await page.route('**/model/meta.json', (route) => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('./');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('GraphPatch could not start: the model description did not load.');
  await expect(alert.getByRole('button', { name: 'Reload' })).toBeVisible();
});
