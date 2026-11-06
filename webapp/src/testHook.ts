/**
 * End-to-end test hook (C5.4). Exists only in builds made with VITE_E2E_HOOKS=1, which
 * playwright.config.ts sets for its webServer build; every other build (dev, GitHub Pages) compiles
 * TEST_HOOKS_ENABLED to false, so the hook and its callers are removed from the bundle.
 *
 * - loadPattern(N, cells): replaces the board with a fixture pattern (fresh undo history).
 * - setCurve(db | null): shows a given |S11| curve instead of the model's prediction (null restores
 *   the prediction). The model was never observed to predict 2+ bands (C1.3), so multi-band UI is
 *   tested with the synthetic curves in fixtures/analysis/band_vectors.json.
 */
export interface TestHook {
  loadPattern: (N: number, cells: readonly number[]) => void;
  setCurve: (db: readonly number[] | null) => void;
}

declare global {
  interface Window {
    __graphpatchTest?: TestHook;
  }
}

export const TEST_HOOKS_ENABLED = import.meta.env.VITE_E2E_HOOKS === '1';

export function installTestHook(hook: TestHook): () => void {
  window.__graphpatchTest = hook;
  return () => {
    delete window.__graphpatchTest;
  };
}
