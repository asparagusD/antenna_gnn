import { expect, test, type Locator, type Page } from '@playwright/test';

// C5.2 grid-size selector. The app opens on the 25×25 example antenna; a size change opens that grid's example.
const N = 25;
const EXAMPLE_METAL = 438; // fixture 25x25-rand-fill70 (src/model/examples.json)
const WARNING = 'Outside the 30–80% range the model was trained on; predictions are less reliable';

async function centre(canvas: Locator, row: number, col: number) {
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('board canvas not visible');
  return { x: box.x + ((col + 0.5) * box.width) / N, y: box.y + ((row + 0.5) * box.height) / N };
}

/** The app as opened: the 25×25 example antenna (438 metal pixels), which counts as unedited. */
async function openBoard(page: Page) {
  await page.goto('./');
  const board = page.getByRole('application', { name: /Metal pattern, 25 by 25 pixels/ });
  await expect(board).toHaveAttribute('data-metal-count', String(EXAMPLE_METAL));
  return { board, canvas: board.locator('canvas') };
}

test('an unedited board changes size at once', async ({ page }) => {
  await openBoard(page);
  const sizes = page.getByRole('group', { name: 'Grid size' });
  await expect(sizes.getByRole('button', { name: '25×25' })).toHaveAttribute('aria-pressed', 'true');

  await sizes.getByRole('button', { name: '35×35' }).click();

  await expect(page.getByRole('application', { name: /Metal pattern, 35 by 35 pixels/ })).toBeVisible();
  await expect(sizes.getByRole('button', { name: '35×35' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: /Switch to 35×35/ })).toHaveCount(0);
});

test('an edited board asks before changing size, and keeps the pattern on cancel', async ({ page }) => {
  const { board, canvas } = await openBoard(page);
  const at = await centre(canvas, 20, 20);
  await page.mouse.click(at.x, at.y);
  await expect(board).not.toHaveAttribute('data-metal-count', String(EXAMPLE_METAL));
  const edited = await board.getAttribute('data-metal-count');

  const sizes = page.getByRole('group', { name: 'Grid size' });
  await sizes.getByRole('button', { name: '35×35' }).click();

  const confirm = page.getByRole('group', { name: 'Switch to 35×35?' });
  await expect(confirm).toContainText('Your 25×25 edits will be cleared');
  // The safe choice takes focus, so a stray Enter keeps the work.
  await expect(confirm.getByRole('button', { name: 'Keep 25×25' })).toBeFocused();
  // Nothing changes until the user answers.
  await expect(board).toHaveAttribute('data-metal-count', edited ?? '');
  await expect(sizes.getByRole('button', { name: '25×25' })).toHaveAttribute('aria-pressed', 'true');

  await confirm.getByRole('button', { name: 'Keep 25×25' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(board).toHaveAttribute('data-metal-count', edited ?? '');
  await expect(sizes.getByRole('button', { name: '25×25' })).toBeFocused();

  // Escape cancels too.
  await sizes.getByRole('button', { name: '12×12' }).click();
  await expect(page.getByRole('group', { name: 'Switch to 12×12?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Switch to 12×12?' })).toHaveCount(0);
  await expect(board).toHaveAttribute('data-metal-count', edited ?? '');

  // A press on the board closes the question (counts as Keep); the size does not change.
  await sizes.getByRole('button', { name: '45×45' }).click();
  await expect(page.getByRole('group', { name: 'Switch to 45×45?' })).toBeVisible();
  const away = await centre(canvas, 22, 2);
  await page.mouse.click(away.x, away.y);
  await expect(page.getByRole('group', { name: 'Switch to 45×45?' })).toHaveCount(0);
  await expect(page.getByRole('application', { name: /25 by 25 pixels/ })).toBeVisible();
});

test('confirming a size change opens that grid’s example antenna with its own history', async ({ page }) => {
  const { canvas } = await openBoard(page);
  const at = await centre(canvas, 20, 20);
  await page.mouse.click(at.x, at.y);

  await page.getByRole('group', { name: 'Grid size' }).getByRole('button', { name: '35×35' }).click();
  await page.getByRole('button', { name: 'Switch to 35×35' }).click();
  await expect(
    page.getByRole('group', { name: 'Grid size' }).getByRole('button', { name: '35×35' }),
  ).toBeFocused();
  await expect(page.getByText('Switched to 35×35: example antenna loaded.')).toBeAttached();

  // The 35×35 example antenna: fixture 35x35-ref-sample_32, 822 of 1225 pixels (67.1%).
  const board = page.getByRole('application', { name: /Metal pattern, 35 by 35 pixels/ });
  await expect(board).toHaveAttribute('data-metal-count', '822');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await expect(page.getByRole('meter', { name: 'Metal fill' })).toContainText('67.1%');
  await expect(page.getByText(WARNING)).toHaveCount(0);
});
