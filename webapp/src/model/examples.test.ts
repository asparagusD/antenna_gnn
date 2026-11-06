import { describe, expect, it } from 'vitest';
import committedMeta from '../../public/model/meta.json';
import { fill, fillStatus } from '../core/grid';
import { exampleGrid, EXAMPLES } from './examples';
import { parseMeta } from './meta';

interface FixtureCase {
  id: string;
  pattern: number[];
  predicted_bands: number;
  predicted_functioning: boolean;
}

const meta = parseMeta(structuredClone(committedMeta));
const fixtures = import.meta.glob<{ cases: FixtureCase[] }>('../../fixtures/*x*.json', {
  eager: true,
  import: 'default',
});

describe('example antennas', () => {
  it.each(meta.grids)('N = %i: matches its fixture, functions with one band, fill inside 30–80%%', (N) => {
    const example = EXAMPLES.find((e) => e.N === N);
    if (example === undefined) throw new Error(`no example for ${String(N)}`);
    const fixture = fixtures[`../../fixtures/${String(N)}x${String(N)}.json`]?.cases.find(
      (c) => c.id === example.fixture_id,
    );
    if (fixture === undefined) throw new Error(`no fixture ${example.fixture_id}`);
    expect(fixture.predicted_bands).toBe(1);
    expect(fixture.predicted_functioning).toBe(true);
    const grid = exampleGrid(N, meta);
    expect(Array.from(grid.cells)).toEqual(fixture.pattern);
    expect(fillStatus(fill(grid))).toBe('ok');
  });
});
