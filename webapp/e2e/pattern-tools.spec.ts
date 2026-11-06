import { expect, test } from '@playwright/test';

// C5.5 starting points on the 25×25 board (625 pixels, 65 seed pixels).
test('Random antenna fills the board to the slider fill; Clear and Undo work', async ({ page }) => {
  await page.goto('./');
  const board = page.getByRole('application', { name: /25 by 25 pixels/ });
  await expect(board).toHaveAttribute('data-metal-count', '65');
  const tools = page.getByRole('toolbar', { name: 'Board tools' });
  await expect(tools.getByRole('button', { name: 'Clear' })).toBeDisabled();

  await tools.getByRole('button', { name: 'Random antenna' }).click();
  await expect(board).toHaveAttribute('data-metal-count', String(Math.round(0.6 * 625))); // 375
  await expect(page.getByRole('meter', { name: 'Metal fill' })).toContainText('60.0%');

  await tools.getByRole('slider', { name: 'Random fill' }).fill('30');
  await tools.getByRole('button', { name: 'Random antenna' }).click();
  await expect(board).toHaveAttribute('data-metal-count', String(Math.round(0.3 * 625))); // 188

  await tools.getByRole('button', { name: 'Clear' }).click();
  await expect(board).toHaveAttribute('data-metal-count', '65');
  await tools.getByRole('button', { name: 'Undo' }).click();
  await expect(board).toHaveAttribute('data-metal-count', '188');
});
