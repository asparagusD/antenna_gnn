/**
 * CSV export (C5.5).
 *
 * - |S11|: header "frequency_ghz,s11_db", then the 201 frequencies (np.linspace(1, 4, 201), 3 decimals)
 *   and the predicted |S11| in dB (6 decimals, the precision of the golden fixtures).
 * - Pattern: N rows of N comma-separated 0/1 values (1 = metal), row-major as drawn on the board, seed
 *   pixels included; it loads back with fromCells().
 * Lines end with "\n", including the last.
 */
import { freqGhz, NUM_FREQ } from './analysis';
import type { Grid } from './grid';

export function s11Csv(db: ArrayLike<number>, freq: ArrayLike<number> = freqGhz): string {
  if (db.length !== NUM_FREQ)
    throw new RangeError(`expected ${String(NUM_FREQ)} values, got ${String(db.length)}`);
  const lines = ['frequency_ghz,s11_db'];
  for (let k = 0; k < NUM_FREQ; k++) {
    lines.push(`${(freq[k] as number).toFixed(3)},${(db[k] as number).toFixed(6)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function patternCsv(grid: Grid): string {
  const { N, cells } = grid;
  const rows: string[] = [];
  for (let r = 0; r < N; r++) rows.push(Array.from(cells.subarray(r * N, (r + 1) * N)).join(','));
  return `${rows.join('\n')}\n`;
}

export function exportFilename(grid: Grid, kind: 's11' | 'pattern'): string {
  return `graphpatch_${String(grid.N)}x${String(grid.N)}_${kind}.csv`;
}
