/**
 * Download size and time to first prediction in a real browser (C8.2).
 *
 * Cold: a fresh browser context (empty HTTP cache) opens the app. Warm: a second page in the same context
 * opens it again, so the assets come from the HTTP cache. For each load it reports
 *   - bytes on the wire per asset (response body as transferred, i.e. gzip-compressed; 0 when cached),
 *   - time to first prediction: from navigation start to the end of the first "graphpatch:predict" User
 *     Timing measure (the first animation frame after the first result reached the page), which includes
 *     the page, the worker, the onnxruntime wasm and the model download, session creation, the graph
 *     build, inference and the first render.
 *
 * Usage (from webapp/):
 *   node scripts/measure-startup.mjs [url] [--runs 5]
 * Default url: the GitHub Pages deployment. For a local check, serve the production build first
 * (npm run build && npm run preview) and pass http://localhost:4173/.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const url = args.find((a) => a.startsWith('http')) ?? 'https://asparagusd.github.io/graphpatch/';
const runs = option('--runs', 5);

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

/** Groups a request URL into the asset kinds worth reporting. */
function kind(requestUrl) {
  const path = new URL(requestUrl).pathname;
  if (path.endsWith('.onnx')) return 'model (.onnx)';
  if (path.endsWith('meta.json')) return 'meta.json';
  if (path.endsWith('.wasm')) return 'onnxruntime (.wasm)';
  if (/worker-[^/]*\.js$/.test(path)) return 'worker JS';
  if (path.endsWith('.js')) return 'app JS';
  if (path.endsWith('.css')) return 'CSS';
  if (path.endsWith('.woff2')) return 'fonts';
  if (path.endsWith('/') || path.endsWith('.html')) return 'HTML';
  return 'other';
}

/** Opens the app in a new page of `context`; returns bytes per kind and the time to first prediction. */
async function load(context) {
  const page = await context.newPage();
  const bytes = {};
  const pending = [];
  // Context-level events also see the dedicated worker's fetches (model, wasm), which a page CDP session
  // does not. A response served from the HTTP cache reports a negative body size: counted as 0 bytes.
  const onFinished = (request) =>
    pending.push(
      request.sizes().then((sizes) => {
        if (request.url().startsWith('data:')) return;
        const k = kind(request.url());
        bytes[k] = (bytes[k] ?? 0) + Math.max(0, sizes.responseBodySize);
      }),
    );
  context.on('requestfinished', onFinished);
  await page.addInitScript(() => {
    window.__firstPredict = new Promise((resolve) => {
      new PerformanceObserver((list, observer) => {
        const entry = list.getEntriesByName('graphpatch:predict')[0];
        if (entry === undefined) return;
        observer.disconnect();
        resolve(entry.startTime + entry.duration);
      }).observe({ type: 'measure', buffered: true });
    });
  });
  await page.goto(url);
  const ttfp = await page.evaluate(() => window.__firstPredict);
  await page.waitForTimeout(500);
  context.off('requestfinished', onFinished);
  await Promise.all(pending);
  await page.close();
  return { ttfp, bytes };
}

const browser = await chromium.launch();
const cold = [];
const warm = [];
let coldBytes = {};
let warmBytes = {};
for (let r = 0; r < runs; r++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const first = await load(context);
  const second = await load(context);
  cold.push(first.ttfp);
  warm.push(second.ttfp);
  coldBytes = first.bytes;
  warmBytes = second.bytes;
  console.log(`run ${r + 1}: cold ${first.ttfp.toFixed(0)} ms, warm ${second.ttfp.toFixed(0)} ms`);
  await context.close();
}
await browser.close();

console.log(`\n${url}, Chromium ${browser.version()}, ${runs} runs`);
console.log('Bytes on the wire (last run):');
const kinds = [...new Set([...Object.keys(coldBytes), ...Object.keys(warmBytes)])].sort();
for (const k of kinds)
  console.log(
    `  ${k.padEnd(20)} cold ${kb(coldBytes[k] ?? 0).padStart(12)}   warm ${kb(warmBytes[k] ?? 0).padStart(12)}`,
  );
const total = (b) => Object.values(b).reduce((t, v) => t + v, 0);
console.log(
  `  ${'total'.padEnd(20)} cold ${kb(total(coldBytes)).padStart(12)}   warm ${kb(total(warmBytes)).padStart(12)}`,
);
const fmt = (v) =>
  `median ${median(v).toFixed(0)} ms (min ${Math.min(...v).toFixed(0)}, max ${Math.max(...v).toFixed(0)})`;
console.log(`Time to first prediction: cold ${fmt(cold)}; warm ${fmt(warm)}`);
