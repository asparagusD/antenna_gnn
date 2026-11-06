import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { create } from '../src/core/grid';
import { encodeShare } from '../src/core/share';
import { parseMeta } from '../src/model/meta';

const meta = parseMeta(
  JSON.parse(readFileSync(new URL('../public/model/meta.json', import.meta.url), 'utf8')) as unknown,
);

/** App URL for a seeds-only N×N board with a fresh undo history (the app itself opens on an example). */
export function seedsOnlyUrl(N: number): string {
  return `./#${encodeShare(create(N, meta))}`;
}

/** Opens the top bar's Starting points panel and presses one of its actions. */
export async function startingPoint(page: Page, action: 'Random antenna' | 'Example antenna'): Promise<void> {
  await page.getByRole('button', { name: 'Starting points' }).click();
  await page.getByRole('group', { name: 'Starting points' }).getByRole('button', { name: action }).click();
}
