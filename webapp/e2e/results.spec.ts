import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { analyse } from '../src/core/analysis';
import { formatDb, formatGhz } from '../src/components/chartScale';
import { formatBandwidth, formatRange } from '../src/components/resultText';
import type { TestHook } from '../src/testHook';

// C5.4: results panel, scope notice and validity note. Fixture patterns are loaded through the e2e-only
// test hook (src/testHook.ts, built with VITE_E2E_HOOKS=1 by playwright.config.ts).

interface FixtureCase {
  id: string;
  pattern: number[];
  predicted_bands: number;
  expected_db: number[];
}

const fixtures = (N: number) =>
  (
    JSON.parse(
      readFileSync(new URL(`../fixtures/${String(N)}x${String(N)}.json`, import.meta.url), 'utf8'),
    ) as {
      cases: FixtureCase[];
    }
  ).cases;

const bandVectors = (
  JSON.parse(readFileSync(new URL('../fixtures/analysis/band_vectors.json', import.meta.url), 'utf8')) as {
    vectors: { db: number[]; bands: number[] }[];
  }
).vectors;

function fixture(N: number, id: string): FixtureCase {
  const found = fixtures(N).find((c) => c.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}

const SCOPE = 'This prediction shows more than one band.';

async function open(page: Page) {
  await page.goto('./');
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await page.waitForFunction(() => window.__graphpatchTest !== undefined);
}

async function loadPattern(page: Page, N: number, cells: number[]) {
  await page.evaluate(
    ([n, c]) => {
      (window.__graphpatchTest as TestHook).loadPattern(n, c);
    },
    [N, cells] as const,
  );
  await expect(
    page.getByRole('application', { name: new RegExp(`${String(N)} by ${String(N)} pixels`) }),
  ).toBeVisible();
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
}

const result = (page: Page, name: string) => page.locator(`[data-result="${name}"]`);

test('panel values match analysis.ts for a single-band fixture pattern (25×25 rand-fill70)', async ({
  page,
}) => {
  const c = fixture(25, '25x25-rand-fill70');
  expect(c.predicted_bands).toBe(1);
  const a = analyse(Float64Array.from(c.expected_db));
  const band = a.bands[0];
  if (band === undefined) throw new Error('fixture has no band');

  await open(page);
  await loadPattern(page, 25, c.pattern);

  await expect(result(page, 'functioning')).toHaveText(a.functioning ? 'Yes' : 'No');
  await expect(result(page, 'resonance')).toHaveText(formatGhz(band.freqGhz));
  await expect(result(page, 'depth')).toHaveText(formatDb(a.minDb));
  await expect(result(page, 'bands')).toHaveText('1');
  const row = page.getByRole('table', { name: 'Bands below −10 dB' }).getByRole('row').nth(1);
  await expect(row).toContainText(formatBandwidth(band));
  await expect(row).toContainText(formatRange(band));
  await expect(page.getByText(/^Predicted in \d+ ms in this browser\.$/)).toBeVisible();

  // Single band: no scope notice.
  await expect(page.getByText(SCOPE)).toHaveCount(0);
});

test('the scope notice appears for a 2-band curve and goes away for a single-band one', async ({ page }) => {
  const twoBand = bandVectors.find((v) => v.bands.length === 2);
  if (twoBand === undefined) throw new Error('no 2-band vector');
  const single = fixture(35, '35x35-rand-fill70');
  expect(single.predicted_bands).toBe(1);

  await open(page);
  await loadPattern(page, 35, single.pattern);
  await expect(result(page, 'bands')).toHaveText('1');
  await expect(page.getByText(SCOPE)).toHaveCount(0);

  // The model never predicts 2+ bands (C1.3), so the hook shows a synthetic 2-band curve.
  await page.evaluate((db) => {
    (window.__graphpatchTest as TestHook).setCurve(db);
  }, twoBand.db);
  const notice = page.getByRole('note');
  await expect(notice).toContainText(SCOPE);
  await expect(notice).toContainText('The model was trained on single-band antennas');
  await expect(page.locator('.scope-notice-live')).toHaveAttribute('aria-live', 'polite');
  await expect(result(page, 'bands')).toHaveText('2');

  // Back to the model's single-band prediction: the notice goes away.
  await page.evaluate(() => {
    (window.__graphpatchTest as TestHook).setCurve(null);
  });
  await expect(result(page, 'bands')).toHaveText('1');
  await expect(page.getByText(SCOPE)).toHaveCount(0);
});

test('on 25×25 the scope notice says that grid also saw multi-band antennas', async ({ page }) => {
  const twoBand = bandVectors.find((v) => v.bands.length === 2);
  if (twoBand === undefined) throw new Error('no 2-band vector');
  await open(page);
  await page.evaluate((db) => {
    (window.__graphpatchTest as TestHook).setCurve(db);
  }, twoBand.db);
  await expect(page.getByRole('note')).toContainText('25×25 training data included multi-band antennas');
});

test('the validity note shows the selected grid’s test MAE and links to the repository', async ({ page }) => {
  await open(page);
  const note = page.getByRole('region', { name: 'About this prediction' });
  await expect(note).toContainText(
    'Test error on 25×25: 0.39 dB mean absolute error over 9,983 test antennas.',
  );
  await page.getByRole('group', { name: 'Grid size' }).getByRole('button', { name: '45×45' }).click();
  await expect(note).toContainText(
    'Test error on 45×45: 0.31 dB mean absolute error over 500 test antennas (single-band and non-functioning only).',
  );
  await expect(note.getByRole('link')).toHaveAttribute('href', 'https://github.com/asparagusD/antenna_gnn');
});
