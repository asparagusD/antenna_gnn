import { expect, test } from '@playwright/test';

// C6.2 performance: inference is single-thread CPU wasm, so only onnxruntime's plain wasm build may load
// (the JSEP build adds WebGPU/WebNN and is about twice the size).
test('loads the plain onnxruntime wasm build, not the JSEP one', async ({ page }) => {
  const wasm: { url: string; bytes: number }[] = [];
  page.on('requestfinished', (request) => {
    if (!request.url().endsWith('.wasm')) return;
    void request.sizes().then((sizes) => wasm.push({ url: request.url(), bytes: sizes.responseBodySize }));
  });
  await page.goto('./');
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await expect.poll(() => wasm.length).toBeGreaterThan(0);
  expect(wasm.map((w) => w.url).filter((u) => u.includes('jsep'))).toEqual([]);
  for (const w of wasm) expect(w.bytes).toBeLessThan(16_000_000);
});
