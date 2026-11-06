import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// C5.5 export: |S11| CSV (frequency, dB) and the pattern CSV (N×N 0/1).

async function download(page: Page, name: string) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name }).click(),
  ]);
  const path = await file.path();
  return { filename: file.suggestedFilename(), text: readFileSync(path, 'utf8') };
}

test('downloads the predicted |S11| and the pattern as CSV', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await page
    .getByRole('toolbar', { name: 'Board tools' })
    .getByRole('button', { name: 'Random antenna' })
    .click();
  await expect(page.locator('figure.s11-chart')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });

  const s11 = await download(page, 'Download |S11| CSV');
  expect(s11.filename).toBe('graphpatch_25x25_s11.csv');
  const lines = s11.text.trimEnd().split('\n');
  expect(lines[0]).toBe('frequency_ghz,s11_db');
  expect(lines).toHaveLength(202);
  expect(lines[1]).toMatch(/^1\.000,-?\d+\.\d{6}$/);
  expect(lines[201]).toMatch(/^4\.000,-?\d+\.\d{6}$/);
  // The table's depth equals the CSV minimum (to the 0.1 dB shown).
  const minDb = Math.min(...lines.slice(1).map((l) => Number(l.split(',')[1])));
  await expect(page.locator('[data-result="depth"]')).toHaveText(
    `${minDb < 0 ? '−' : ''}${Math.abs(minDb).toFixed(1)} dB`,
  );

  const pattern = await download(page, 'Download pattern CSV');
  expect(pattern.filename).toBe('graphpatch_25x25_pattern.csv');
  const rows = pattern.text.trimEnd().split('\n');
  expect(rows).toHaveLength(25);
  expect(rows.every((r) => /^[01](,[01]){24}$/.test(r))).toBe(true);
  const metal = rows
    .join(',')
    .split(',')
    .filter((v) => v === '1').length;
  await expect(page.getByRole('application', { name: /25 by 25/ })).toHaveAttribute(
    'data-metal-count',
    String(metal),
  );
});
