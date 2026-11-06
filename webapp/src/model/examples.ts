/**
 * Example antennas (C6.1): one known single-band, functioning pattern per grid from the C1.3 golden
 * fixtures, bundled as share strings (examples.json, made by scripts/make-examples.mjs). The app opens on
 * the selected grid's example, so the first thing anyone sees is an antenna that works.
 */
import { decodeShare } from '../core/share';
import type { Grid, GridSpec } from '../core/grid';
import data from './examples.json';

export interface Example {
  N: number;
  fixture_id: string;
  share: string;
  predicted_min_db: number;
}

export const EXAMPLES: readonly Example[] = data.examples;

/** The example antenna for an N×N grid; throws if examples.json and meta.json disagree. */
export function exampleGrid(N: number, spec: GridSpec): Grid {
  const example = EXAMPLES.find((e) => e.N === N);
  if (example === undefined) throw new RangeError(`no example antenna for ${String(N)}×${String(N)}`);
  const decoded = decodeShare(example.share, spec);
  if (decoded === null || !decoded.ok) throw new RangeError(`example ${example.fixture_id} does not decode`);
  return decoded.grid;
}
