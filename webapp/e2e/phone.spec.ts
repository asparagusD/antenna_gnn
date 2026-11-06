import { devices, expect, test, type Page } from '@playwright/test';

// C6.3 phone adaptation, emulated in Chromium (Pixel 7: 412×915, touch, coarse pointer). Layout and
// synthesized touch only; no physical device.
test.use({ ...devices['Pixel 7'] });

async function ready(page: Page) {
  await page.goto('./');
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
}

test('every visible control is at least 44×44 px on a coarse pointer', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Starting points' }).click();
  const small = await page.locator('button, select, input, a[href]').evaluateAll((els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          el: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim(),
          w: r.width,
          h: r.height,
        };
      })
      .filter((t) => t.w < 44 || t.h < 44),
  );
  expect(small).toEqual([]);
});

test('a sticky summary keeps the verdict in view while painting; tapping it shows the chart', async ({
  page,
}) => {
  await ready(page);
  const summary = page.getByRole('button', { name: /^Show the prediction:/ });
  await expect(summary).toContainText('Functioning');
  await expect(summary).toContainText('3.850 GHz');
  await expect(summary).toContainText('−21.4 dB');
  // Scroll so the board fills the screen: the summary stays pinned to the top.
  // (Mobile emulation ignores mouse-wheel scrolling, so scroll the window directly.)
  await page.evaluate(() => {
    window.scrollTo(0, 400);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  const box = await summary.boundingBox();
  expect(box?.y ?? 99).toBeLessThan(1);
  await summary.tap();
  await expect(page.locator('figure.s11-chart')).toBeInViewport();
  // The share link stays in the address bar.
  expect(new URL(page.url()).hash).toMatch(/^#p=v1\./);
});

test('result cells sit two to a row on a phone, with nothing clipped', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page);
  const tops = await page
    .locator('.results-cell')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(tops[0]).toBe(tops[1]);
  expect(tops[2]).toBe(tops[3]);
  const clipped = await page
    .locator('.results-value')
    .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);
});

test('the Starting points panel and the size question open as bottom sheets', async ({ page }) => {
  await ready(page);
  const height = page.viewportSize()?.height ?? 0;
  await page.getByRole('button', { name: 'Starting points' }).tap();
  const panel = await page.getByRole('group', { name: 'Starting points' }).boundingBox();
  expect(height - ((panel?.y ?? 0) + (panel?.height ?? 0))).toBeLessThanOrEqual(24);
  await page.getByRole('button', { name: 'Random antenna' }).tap();

  await page.getByRole('group', { name: 'Grid size' }).getByRole('button', { name: '35×35' }).tap();
  const question = await page.getByRole('group', { name: 'Switch to 35×35?' }).boundingBox();
  expect(height - ((question?.y ?? 0) + (question?.height ?? 0))).toBeLessThanOrEqual(24);
});

test('board gestures: one finger paints, a second finger does not, pinch-zoom is allowed', async ({
  page,
}) => {
  await ready(page);
  const board = page.getByRole('application', { name: /25 by 25 pixels/ });
  const canvas = board.locator('canvas');
  expect(await canvas.evaluate((el) => getComputedStyle(el).touchAction)).toBe('pinch-zoom');
  // The frame around the canvas scrolls the page vertically.
  expect(await board.evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y pinch-zoom');

  const box = await canvas.boundingBox();
  if (box === null) throw new Error('no canvas');
  const at = (row: number, col: number) => ({
    x: box.x + ((col + 0.5) * box.width) / 25,
    y: box.y + ((row + 0.5) * box.height) / 25,
  });
  const before = Number(await board.getAttribute('data-metal-count'));
  await page.touchscreen.tap(at(22, 2).x, at(22, 2).y);
  await expect(board).not.toHaveAttribute('data-metal-count', String(before));
  const afterTap = Number(await board.getAttribute('data-metal-count'));
  expect(Math.abs(afterTap - before)).toBe(1);

  // Two fingers on different pixels: only the first (primary) pointer paints.
  const cdp = await page.context().newCDPSession(page);
  const p1 = { ...at(20, 20), id: 1 };
  const p2 = { ...at(2, 20), id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1, p2] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(async () => Math.abs(Number(await board.getAttribute('data-metal-count')) - afterTap))
    .toBe(1);
});
