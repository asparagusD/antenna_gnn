import { describe, expect, it } from 'vitest';
import committedMeta from '../../public/model/meta.json';
import { parseMeta } from '../model/meta';
import {
  create,
  fill,
  fillStatus,
  fromCells,
  get,
  isEdited,
  isSeed,
  mulberry32,
  paint,
  randomPattern,
  toggle,
  type Grid,
  type GridSpec,
} from './grid';

const meta: GridSpec = parseMeta(structuredClone(committedMeta));
const GRIDS = [12, 15, 25, 35, 45] as const;
const SEED_COUNTS: Record<number, number> = { 12: 26, 15: 37, 25: 65, 35: 145, 45: 197 };

function count(grid: Grid): number {
  return grid.cells.reduce((sum, v) => sum + v, 0);
}

/** First (row, col) that is not a seed pixel. */
function freeCell(grid: Grid): [number, number] {
  for (let r = 0; r < grid.N; r++) {
    for (let c = 0; c < grid.N; c++) {
      if (!isSeed(grid, r, c)) return [r, c];
    }
  }
  throw new Error('no free cell');
}

/** First (row, col) that is a seed pixel. */
function seedCell(grid: Grid): [number, number] {
  for (let r = 0; r < grid.N; r++) {
    for (let c = 0; c < grid.N; c++) {
      if (isSeed(grid, r, c)) return [r, c];
    }
  }
  throw new Error('no seed cell');
}

describe('create', () => {
  it.each(GRIDS)('%i×%i: all air except the seed pixels, which are metal', (N) => {
    const grid = create(N, meta);
    expect(grid.N).toBe(N);
    expect(grid.cells).toBeInstanceOf(Uint8Array);
    expect(grid.cells).toHaveLength(N * N);
    const seed = meta.seed_masks[String(N)] ?? [];
    expect(Array.from(grid.cells)).toEqual(seed);
    expect(count(grid)).toBe(SEED_COUNTS[N]);
  });

  it.each([0, 10, 20, 55, 12.5, -12])('throws for unsupported N = %s', (N) => {
    expect(() => create(N, meta)).toThrow(/unsupported grid/);
  });

  it('throws when the meta has no seed mask for a listed grid', () => {
    const broken: GridSpec = { grids: [12], seed_masks: {} };
    expect(() => create(12, broken)).toThrow(/seed mask/);
  });
});

describe('toggle and paint', () => {
  it('toggle flips a free pixel and returns a new grid; the original is unchanged', () => {
    const grid = create(25, meta);
    const [r, c] = freeCell(grid);
    const next = toggle(grid, r, c);
    expect(next).not.toBe(grid);
    expect(get(next, r, c)).toBe(1);
    expect(get(grid, r, c)).toBe(0);
    expect(next.cells).not.toBe(grid.cells);
    expect(Array.from(toggle(next, r, c).cells)).toEqual(Array.from(grid.cells));
  });

  it('paint sets a free pixel to the given value', () => {
    const grid = create(15, meta);
    const [r, c] = freeCell(grid);
    const metal = paint(grid, r, c, 1);
    expect(get(metal, r, c)).toBe(1);
    expect(get(paint(metal, r, c, 0), r, c)).toBe(0);
  });

  it('painting the value a pixel already has returns the same grid', () => {
    const grid = create(12, meta);
    const [r, c] = freeCell(grid);
    expect(paint(grid, r, c, 0)).toBe(grid);
  });

  it.each(GRIDS)('%i×%i: seed pixels are locked; toggle and paint return the same grid', (N) => {
    const grid = create(N, meta);
    const [r, c] = seedCell(grid);
    expect(toggle(grid, r, c)).toBe(grid);
    expect(paint(grid, r, c, 0)).toBe(grid);
    expect(paint(grid, r, c, 1)).toBe(grid);
    expect(get(grid, r, c)).toBe(1);
  });

  it.each([
    [-1, 0],
    [0, -1],
    [12, 0],
    [0, 12],
    [1.5, 0],
    [0, Number.NaN],
  ])('out-of-range index (%s, %s) throws RangeError', (r, c) => {
    const grid = create(12, meta);
    expect(() => toggle(grid, r, c)).toThrow(RangeError);
    expect(() => paint(grid, r, c, 1)).toThrow(RangeError);
    expect(() => get(grid, r, c)).toThrow(RangeError);
    expect(() => isSeed(grid, r, c)).toThrow(RangeError);
  });

  it('paint rejects values other than 0 and 1', () => {
    const grid = create(12, meta);
    const [r, c] = freeCell(grid);
    expect(() => paint(grid, r, c, 2 as 0 | 1)).toThrow(RangeError);
  });
});

describe('fill and fillStatus', () => {
  it('fill is the metal fraction over N² with seeds included', () => {
    const grid = create(12, meta);
    expect(fill(grid)).toBeCloseTo(26 / 144, 12);
    const [r, c] = freeCell(grid);
    expect(fill(toggle(grid, r, c))).toBeCloseTo(27 / 144, 12);
  });

  it.each([
    [0, 'low'],
    [0.2999, 'low'],
    [0.3, 'ok'],
    [0.55, 'ok'],
    [0.8, 'ok'],
    [0.8001, 'high'],
    [1, 'high'],
  ] as const)('fillStatus(%s) is %s (inclusive bounds count as ok)', (value, status) => {
    expect(fillStatus(value)).toBe(status);
  });

  it('fillStatus works on exact grid fractions at the bounds', () => {
    // 0.3 and 0.8 of 100 pixels are exact counts; computed as count / N^2 they must still be ok.
    expect(fillStatus(30 / 100)).toBe('ok');
    expect(fillStatus(80 / 100)).toBe('ok');
  });

  it.each([Number.NaN, -0.1, 1.1])('fillStatus(%s) throws RangeError', (value) => {
    expect(() => fillStatus(value)).toThrow(RangeError);
  });
});

describe('fromCells', () => {
  it('builds a grid from N*N 0/1 values with seeds metal', () => {
    const base = toggle(create(12, meta), ...freeCell(create(12, meta)));
    const grid = fromCells(12, Array.from(base.cells), meta);
    expect(Array.from(grid.cells)).toEqual(Array.from(base.cells));
    expect(grid.seed).toBe(create(12, meta).seed);
  });

  it.each([
    ['wrong length', new Array<number>(143).fill(1)],
    ['non 0/1 value', [...new Array<number>(143).fill(1), 2]],
  ])('rejects %s', (_, cells) => {
    expect(() => fromCells(12, cells, meta)).toThrow(RangeError);
  });

  it('rejects air on a seed pixel', () => {
    const grid = create(12, meta);
    const [r, c] = seedCell(grid);
    const cells = Array.from(grid.cells);
    cells[r * 12 + c] = 0;
    expect(() => fromCells(12, cells, meta)).toThrow(/seed pixel/);
  });
});

describe('isEdited', () => {
  it.each(GRIDS)('a fresh grid of N = %i (seeds only) is not edited', (N) => {
    expect(isEdited(create(N, meta))).toBe(false);
  });

  it('one painted pixel makes it edited; painting it back makes it fresh again', () => {
    const grid = create(25, meta);
    const [r, c] = freeCell(grid);
    const painted = toggle(grid, r, c);
    expect(isEdited(painted)).toBe(true);
    expect(isEdited(toggle(painted, r, c))).toBe(false);
  });

  it('a random pattern is edited', () => {
    expect(isEdited(randomPattern(15, 0.5, mulberry32(1), meta))).toBe(true);
  });
});

describe('randomPattern', () => {
  it.each(GRIDS)('%i×%i: seeds metal and exactly round(target · N²) metal pixels', (N) => {
    const grid = randomPattern(N, 0.6, mulberry32(7), meta);
    expect(grid.N).toBe(N);
    expect(count(grid)).toBe(Math.round(0.6 * N * N));
    const seed = meta.seed_masks[String(N)] ?? [];
    seed.forEach((s, k) => {
      if (s === 1) expect(grid.cells[k]).toBe(1);
    });
  });

  it('is deterministic for a given RNG seed and differs between seeds', () => {
    const a = randomPattern(25, 0.5, mulberry32(42), meta);
    const b = randomPattern(25, 0.5, mulberry32(42), meta);
    const c = randomPattern(25, 0.5, mulberry32(43), meta);
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
    expect(Array.from(a.cells)).not.toEqual(Array.from(c.cells));
  });

  it('a target below the seed fill gives the seeds only', () => {
    const grid = randomPattern(12, 0.05, mulberry32(1), meta);
    expect(Array.from(grid.cells)).toEqual(meta.seed_masks['12']);
  });

  it('target 1 fills every pixel', () => {
    expect(count(randomPattern(15, 1, mulberry32(1), meta))).toBe(225);
  });

  it.each([-0.1, 1.5, Number.NaN])('rejects target fill %s', (target) => {
    expect(() => randomPattern(12, target, mulberry32(1), meta)).toThrow(RangeError);
  });

  it('rejects an unsupported N', () => {
    expect(() => randomPattern(20, 0.5, mulberry32(1), meta)).toThrow(/unsupported grid/);
  });
});

describe('mulberry32', () => {
  it('returns reproducible values in [0, 1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
