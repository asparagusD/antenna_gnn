/**
 * Perceived prediction latency in a real browser (C5.3).
 *
 * Measures the User Timing entry "graphpatch:predict" that the app records for every applied result:
 * from the edit's request to the first animation frame after the result reached the main thread
 * (graph build + onnxruntime-web wasm inference + messaging + React commit). The worker also reports
 * its own inference time (detail.inferMs).
 *
 * Usage (from webapp/, with the production build served, e.g. `npm run build && npm run preview`):
 *   node scripts/measure-latency.mjs [url] [--clicks 30] [--cpu 1]
 *   --cpu 4 slows the page's main thread 4x through the DevTools protocol. It does NOT slow the
 *   inference worker (measured: worker times unchanged), so it only shows main-thread overhead.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4173/';
const clicks = option('--clicks', 30);
const cpu = option('--cpu', 1);

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const summary = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mean = s.reduce((t, v) => t + v, 0) / s.length;
  return `median ${quantile(s, 0.5).toFixed(1)} ms, p90 ${quantile(s, 0.9).toFixed(1)} ms, mean ${mean.toFixed(1)} ms, max ${s.at(-1).toFixed(1)} ms (n=${s.length})`;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
if (cpu > 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
}

async function settle() {
  await page.locator('figure.s11-chart[aria-busy="false"] path.s11-curve').waitFor({ timeout: 60_000 });
}

async function measureGrid(N) {
  await page.goto(url);
  await settle();
  if (N !== 25) {
    await page.getByRole('group', { name: 'Grid size' }).getByRole('button', { name: `${N}×${N}` }).click();
    await page.getByRole('application', { name: new RegExp(`${N} by ${N} pixels`) }).waitFor();
    await settle();
  }
  await page.evaluate(() => {
    window.__latency = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__latency.push({ total: e.duration, infer: e.detail?.inferMs });
    }).observe({ type: 'measure' });
  });
  const canvas = page.getByRole('application', { name: new RegExp(`${N} by ${N} pixels`) }).locator('canvas');
  const box = await canvas.boundingBox();
  // Toggle a corner pixel (never a seed) on and off; wait for each prediction before the next edit.
  const x = box.x + (0.5 * box.width) / N;
  const y = box.y + (0.5 * box.height) / N;
  for (let i = 0; i < clicks; i++) {
    const count = await page.evaluate(() => window.__latency.length);
    await page.mouse.click(x, y);
    await page.waitForFunction((n) => window.__latency.length > n, count, { timeout: 60_000 });
  }
  const samples = await page.evaluate(() => window.__latency);
  return {
    total: samples.map((s) => s.total),
    infer: samples.map((s) => s.infer).filter((v) => typeof v === 'number'),
  };
}

console.log(`url ${url}, CPU throttle ${cpu}x, ${clicks} single-pixel edits per grid`);
for (const N of [12, 25, 45]) {
  const { total, infer } = await measureGrid(N);
  console.log(`${N}x${N}  perceived: ${summary(total)}`);
  console.log(`${' '.repeat(String(N).length * 2 + 1)}  worker inference: ${summary(infer)}`);
}
await browser.close();
