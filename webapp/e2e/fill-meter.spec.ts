import { expect, test, type Locator, type Page } from '@playwright/test';

// C5.2 fill meter. The app opens on a 25x25 board with only the seed pixels metal: rows/cols 8-15
// (0-based) plus the feed pixel (5, 12) -> 65 of 625 pixels (10.4%).
const N = 25;
const SEED_METAL = 65;
const WARNING = 'Outside the 30–80% range the model was trained on; predictions are less reliable';

const isSeed = (row: number, col: number) =>
  (row >= 8 && row <= 15 && col >= 8 && col <= 15) || (row === 5 && col === 12);

/** Free (non-seed) pixels of the 25x25 board in row-major order. */
const FREE: readonly (readonly [number, number])[] = Array.from({ length: N * N }, (_, k) => {
  const row = Math.floor(k / N);
  return [row, k % N] as const;
}).filter(([row, col]) => !isSeed(row, col));

async function centre(canvas: Locator, row: number, col: number) {
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('board canvas not visible');
  return { x: box.x + ((col + 0.5) * box.width) / N, y: box.y + ((row + 0.5) * box.height) / N };
}

function free(k: number): readonly [number, number] {
  const cell = FREE[k];
  if (cell === undefined) throw new Error(`no free pixel ${String(k)}`);
  return cell;
}

/** Paints FREE[from..to) as metal, one drag per run of neighbouring pixels in a row. */
async function paintFree(page: Page, canvas: Locator, from: number, to: number) {
  let k = from;
  while (k < to) {
    const [row, startCol] = free(k);
    let end = k;
    while (end + 1 < to) {
      const [nextRow, nextCol] = free(end + 1);
      if (nextRow !== row || nextCol !== free(end)[1] + 1) break;
      end++;
    }
    const a = await centre(canvas, row, startCol);
    const b = await centre(canvas, row, free(end)[1]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    if (end > k) await page.mouse.move(b.x, b.y, { steps: 2 });
    await page.mouse.up();
    k = end + 1;
  }
}

async function openBoard(page: Page) {
  await page.goto('./');
  const board = page.getByRole('application', { name: /Metal pattern, 25 by 25 pixels/ });
  await expect(board).toHaveAttribute('data-metal-count', String(SEED_METAL));
  return { board, canvas: board.locator('canvas') };
}

test('the fill warning appears at 29% and 81%, not at 30% or 80%', async ({ page }) => {
  const { board, canvas } = await openBoard(page);
  const meter = page.getByRole('meter', { name: 'Metal fill' });
  const warning = page.getByText(WARNING);

  // Exactly 30% is not reachable on any supported grid (N² is never a multiple of 100), so the
  // lower bound is bracketed by the pixels either side of it: 187/625 = 29.9% and 188/625 = 30.1%.
  const steps: [metal: number, shown: string, warns: boolean][] = [
    [181, '29.0%', true],
    [187, '29.9%', true],
    [188, '30.1%', false],
    [500, '80.0%', false], // exact: 500 / 625 = 0.8
    [501, '80.2%', true],
    [506, '81.0%', true],
  ];
  let painted = 0;
  for (const [metal, shown, warns] of steps) {
    await paintFree(page, canvas, painted, metal - SEED_METAL);
    painted = metal - SEED_METAL;
    await expect(board).toHaveAttribute('data-metal-count', String(metal));
    await expect(meter).toContainText(shown);
    if (warns) await expect(warning).toBeVisible();
    else await expect(warning).toHaveCount(0);
  }
});
