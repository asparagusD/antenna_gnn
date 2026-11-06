import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedsOnlyUrl } from './helpers';

// These tests open a seeds-only 25x25 board through seedsOnlyUrl (the app itself opens on an example
// antenna): the block at rows/cols 8-15 (0-based) plus the feed pixel at (5, 12) -> 65 metal pixels.
const N = 25;
const SEED_METAL = 65;

async function cellCentre(canvas: Locator, row: number, col: number) {
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('board canvas not visible');
  return { x: box.x + ((col + 0.5) * box.width) / N, y: box.y + ((row + 0.5) * box.height) / N };
}

async function metalCount(board: Locator): Promise<number> {
  return Number(await board.getAttribute('data-metal-count'));
}

async function openBoard(page: Page) {
  await page.goto(seedsOnlyUrl(N));
  const board = page.getByRole('application', { name: /Metal pattern, 25 by 25 pixels/ });
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL));
  return { board, canvas: board.locator('canvas') };
}

test('a click toggles a free cell to metal and back', async ({ page }) => {
  const { board, canvas } = await openBoard(page);
  const at = await cellCentre(canvas, 20, 20);
  await page.mouse.click(at.x, at.y);
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL + 1));
  await expect(page.getByText('Row 21, column 21: metal, not connected to the feed')).toBeVisible();
  await page.mouse.click(at.x, at.y);
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL));
});

test('a drag paints a continuous line with the first cell’s new value', async ({ page }) => {
  const { board, canvas } = await openBoard(page);
  const from = await cellCentre(canvas, 2, 2);
  const to = await cellCentre(canvas, 2, 10);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 }); // fast drag: samples skip cells, the line must not
  await page.mouse.up();
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL + 9));

  // Dragging back over the painted line, starting on metal, erases it.
  await page.mouse.move(to.x, to.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y, { steps: 2 });
  await page.mouse.up();
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL));
});

test('seed cells do not change and explain why', async ({ page }) => {
  const { board, canvas } = await openBoard(page);
  const seed = await cellCentre(canvas, 10, 10);
  await page.mouse.click(seed.x, seed.y);
  expect(await metalCount(board)).toBe(SEED_METAL);
  await expect(page.getByRole('tooltip')).toHaveText('Seed pixel: always metal · not connected to the feed');
  await expect(
    page.getByText('Row 11, column 11: seed pixel, always metal, not connected to the feed'),
  ).toBeVisible();

  // A drag across the seed block in erase mode leaves every seed pixel metal.
  const metal = await cellCentre(canvas, 12, 2);
  await page.mouse.click(metal.x, metal.y); // make (12, 2) metal
  const start = await cellCentre(canvas, 12, 2);
  const end = await cellCentre(canvas, 12, 20);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down(); // first cell is metal -> this stroke erases
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
  expect(await metalCount(board)).toBe(SEED_METAL);
});

test('the feed pixel is marked and locked', async ({ page }) => {
  const { board, canvas } = await openBoard(page);
  const feed = await cellCentre(canvas, 5, 12);
  await page.mouse.move(feed.x, feed.y);
  await expect(page.getByRole('tooltip')).toHaveText('Feed pixel: always metal');
  await page.mouse.click(feed.x, feed.y);
  expect(await metalCount(board)).toBe(SEED_METAL);
});

test('bridging the feed to the seed block reports it as connected (live copper)', async ({ page }) => {
  const { canvas } = await openBoard(page);
  // At 25x25 the feed (5, 12) sits one pixel above the seed block; a diagonal pair joins them (8-connected).
  for (const [row, col] of [
    [6, 13],
    [7, 14],
  ] as const) {
    const at = await cellCentre(canvas, row, col);
    await page.mouse.click(at.x, at.y);
  }
  const seed = await cellCentre(canvas, 10, 10);
  await page.mouse.move(seed.x, seed.y);
  await expect(page.getByRole('tooltip')).toHaveText('Seed pixel: always metal');
  await expect(
    page.getByText('Row 11, column 11: seed pixel, always metal, connected to the feed'),
  ).toBeVisible();
});

test('the keyboard moves a cursor and toggles with Space', async ({ page }) => {
  const { board } = await openBoard(page);
  await board.focus(); // cursor starts on the feed pixel (5, 12)
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp'); // (3, 12): free
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL + 1));
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft'); // paints (3, 11) and (3, 10) with metal
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL + 3));
});

test('undo reverts a whole stroke; redo re-applies it (keys and buttons)', async ({ page }) => {
  const { board, canvas } = await openBoard(page);
  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeDisabled();

  const from = await cellCentre(canvas, 22, 2);
  const to = await cellCentre(canvas, 22, 9);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL + 8));

  await page.keyboard.press('ControlOrMeta+z'); // one step undoes the whole 8-pixel stroke
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL));
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL + 8));

  await undo.click();
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL));
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL + 8));
});
