import { expect, test, type Page } from '@playwright/test';
import { startingPoint } from './helpers';

// C5.5 share links: the URL hash holds N and the pixels (src/core/share.ts).

/**
 * The curve once the prediction has arrived AND the 180 ms transition has finished: aria-busy turns
 * false when the result arrives, while the path is still tweening, so wait until d stops changing.
 */
async function settledCurve(page: Page): Promise<string> {
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  const path = page.locator('path.s11-curve');
  let previous = await path.getAttribute('d');
  for (;;) {
    await page.waitForTimeout(250);
    const d = await path.getAttribute('d');
    if (d === null) throw new Error('no curve');
    if (d === previous) return d;
    previous = d;
  }
}

test('a share URL restores the exact pattern and the same curve', async ({ page, browser }) => {
  await page.goto('./');
  await settledCurve(page);
  await page.getByRole('group', { name: 'Grid size' }).getByRole('button', { name: '35×35' }).click();
  await startingPoint(page, 'Random antenna');
  const board = page.getByRole('application', { name: /35 by 35 pixels/ });
  const metal = await board.getAttribute('data-metal-count');
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#p=v1\.35\.[A-Za-z0-9_-]+$/);
  const url = page.url();
  const curve = await settledCurve(page);

  // A fresh browser context: nothing shared but the URL.
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(url);
  const restored = other.getByRole('application', { name: /35 by 35 pixels/ });
  await expect(restored).toHaveAttribute('data-metal-count', metal ?? '');
  // The app re-encodes its grid into the hash; the same hash means the same N² pixels.
  await expect.poll(() => other.url()).toBe(url);
  await expect.poll(() => settledCurve(other), { timeout: 30_000 }).toBe(curve);
  await context.close();
});

test('the address bar follows edits, and Copy share link copies it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await settledCurve(page);
  const before = page.url();
  await startingPoint(page, 'Random antenna');
  await expect.poll(() => page.url()).not.toBe(before);
  await page.getByRole('button', { name: 'Copy share link' }).click();
  await expect(page.getByText('Link copied. It restores this exact pattern.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test('an invalid share link shows a friendly error and a fresh grid', async ({ page }) => {
  await page.goto('./#p=v1.25.AAAA');
  await expect(page.getByRole('alert')).toHaveText(
    /This share link could not be opened: the pattern data is incomplete or damaged\. Showing a fresh 25×25 grid instead\./,
  );
  const board = page.getByRole('application', { name: /25 by 25 pixels/ });
  await expect(board).toHaveAttribute('data-metal-count', '65');
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#p=v1\.25\./);
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a link pasted into the same tab loads its pattern', async ({ page }) => {
  await page.goto('./');
  await settledCurve(page);
  await startingPoint(page, 'Random antenna');
  const shared = new URL(page.url()).hash;
  await page.getByRole('toolbar', { name: 'Board tools' }).getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('application', { name: /25 by 25/ })).toHaveAttribute('data-metal-count', '65');
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, shared);
  await expect(page.getByRole('application', { name: /25 by 25/ })).toHaveAttribute(
    'data-metal-count',
    '375',
  );
});
