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
