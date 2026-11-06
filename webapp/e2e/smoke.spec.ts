import { expect, test } from '@playwright/test';

test('page renders and loads the model meta', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'GraphPatch' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('model meta loaded: 5 grids');
  expect(errors).toEqual([]);
});
