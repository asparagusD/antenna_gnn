import type { Page } from '@playwright/test';

/** Opens the top bar's Starting points panel and presses one of its actions. */
export async function startingPoint(page: Page, action: 'Random antenna' | 'Example antenna'): Promise<void> {
  await page.getByRole('button', { name: 'Starting points' }).click();
  await page.getByRole('group', { name: 'Starting points' }).getByRole('button', { name: action }).click();
}
