import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Response } from '@playwright/test';
import { create } from '../src/core/grid';
import { encodeShare, decodeShare } from '../src/core/share';
import { parseMeta } from '../src/model/meta';

// C7.2: the deployed app, end to end, in a real browser: page and model load, browser inference matches
// the Python reference on every golden fixture within the 1e-4 dB contract, share links round-trip, the
// console is clean, and the big assets are served correctly.

const TOLERANCE_DB = 1e-4;
const meta = parseMeta(
  JSON.parse(readFileSync(new URL('../public/model/meta.json', import.meta.url), 'utf8')) as unknown,
);

interface FixtureCase {
  id: string;
  pattern: number[];
  expected_db: number[];
}
/** Every golden fixture case for grid N (C8.1: all 48 cases, not only the first per grid). */
const fixtures = (N: number): FixtureCase[] => {
  const file = JSON.parse(
    readFileSync(new URL(`../fixtures/${String(N)}x${String(N)}.json`, import.meta.url), 'utf8'),
  ) as { cases: FixtureCase[] };
  if (file.cases.length === 0) throw new Error(`no fixture for ${String(N)}`);
  return file.cases;
};

/** Collects console errors/warnings and page errors for the whole test. */
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      problems.push(`${message.type()}: ${message.text()}`);
  });
  return problems;
}

async function settled(page: Page) {
  await expect(page.getByRole('status')).toHaveText('Model ready · runs in your browser', {
    timeout: 90_000,
  });
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
}

test('page and model load; console clean; assets served with 200, right types and caching', async ({
  page,
}) => {
  const problems = watchConsole(page);
  const responses: Response[] = [];
  page.on('response', (response) => responses.push(response));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'GraphPatch' })).toBeVisible();
  await settled(page);

  const find = (pattern: RegExp) => responses.find((r) => pattern.test(new URL(r.url()).pathname));
  const assets = {
    html: find(/\/graphpatch\/$|\/$/),
    meta: find(/\/model\/meta\.json$/),
    onnx: find(/\/model\/antenna_gnn\.onnx$/),
    wasm: find(/\/assets\/ort-wasm[^/]*\.wasm$/),
  };
  const report: Record<string, unknown> = {};
  for (const [name, response] of Object.entries(assets)) {
    expect(response, `${name} was not requested`).toBeDefined();
    if (response === undefined) continue;
    const h = await response.allHeaders();
    report[name] = {
      url: response.url(),
      status: response.status(),
      type: h['content-type'],
      cache: h['cache-control'],
      etag: h.etag,
      lastModified: h['last-modified'],
      encoding: h['content-encoding'],
    };
    expect(response.status(), `${name} status`).toBe(200);
    expect(h['cache-control'] ?? '', `${name} must not forbid caching`).not.toMatch(/no-store/);
  }
  // Streaming wasm compilation needs the right MIME type.
  expect(await assets.wasm?.headerValue('content-type')).toMatch(/^application\/wasm/);
  // Single-thread wasm needs no cross-origin isolation (no COOP/COEP headers).
  report.crossOriginIsolated = await page.evaluate(() => window.crossOriginIsolated);
  console.log(JSON.stringify(report, null, 2));
  expect(problems).toEqual([]);
});

for (const N of meta.grids)
  for (const c of fixtures(N)) {
    test(`parity in the browser: ${c.id} within ${String(TOLERANCE_DB)} dB`, async ({ page }) => {
      const problems = watchConsole(page);
      const grid = create(N, meta);
      const shared = decodeShare(encodeShare({ ...grid, cells: Uint8Array.from(c.pattern) }), meta);
      if (shared === null || !shared.ok) throw new Error('fixture pattern does not encode');
      await page.goto(`./#${encodeShare(shared.grid)}`);
      await expect(
        page.getByRole('application', { name: new RegExp(`${String(N)} by ${String(N)} pixels`) }),
      ).toBeVisible();
      await settled(page);
      const [file] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download |S11| CSV' }).click(),
      ]);
      const rows = readFileSync(await file.path(), 'utf8')
        .trimEnd()
        .split('\n')
        .slice(1);
      const db = rows.map((row) => Number(row.split(',')[1]));
      expect(db).toHaveLength(201);
      const maxDiff = Math.max(...db.map((v, k) => Math.abs(v - (c.expected_db[k] ?? Number.NaN))));
      console.log(`${c.id}: max |browser − reference| = ${maxDiff.toExponential(2)} dB`);
      expect(maxDiff).toBeLessThanOrEqual(TOLERANCE_DB);
      expect(problems).toEqual([]);
    });
  }

test('a share link round-trips in a fresh browser context', async ({ page, browser }) => {
  await page.goto('./');
  await settled(page);
  await page.getByRole('button', { name: 'Starting points' }).click();
  await page.getByRole('button', { name: 'Random antenna' }).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#p=v1\.25\./);
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
  const url = page.url();
  const metal = await page
    .getByRole('application', { name: /Metal pattern/ })
    .getAttribute('data-metal-count');
  const depth = await page.locator('[data-result="depth"]').textContent();

  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(url);
  await settled(other);
  await expect(other.getByRole('application', { name: /Metal pattern/ })).toHaveAttribute(
    'data-metal-count',
    metal ?? '',
  );
  await expect.poll(() => other.url()).toBe(url);
  await expect(other.locator('[data-result="depth"]')).toHaveText(depth ?? '');
  await context.close();
});
