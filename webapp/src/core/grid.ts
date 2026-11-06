/**
 * Immutable grid state for the pixel editor (C4.1).
 *
 * A Grid is an N×N 0/1 metal pattern, row-major (index i*N + j, as in the Python builder and the
 * fixtures). Seed pixels come from meta.json and are always metal: every edit that would change one
 * is a no-op that returns the same Grid object. Edits never mutate; they return a new Grid with a
 * fresh `cells` array, so React can compare grids by identity.
 */
import type { ModelMeta } from '../model/meta';

/** The part of meta.json the grid needs. */
export type GridSpec = Pick<ModelMeta, 'grids' | 'seed_masks'>;

export type Cell = 0 | 1;

export interface Grid {
  readonly N: number;
  /** N*N values, 0 = air, 1 = metal, row-major. Treat as read-only. */
  readonly cells: Uint8Array;
  /** N*N values, 1 = seed pixel (locked metal). Shared between grids of the same N. */
  readonly seed: Uint8Array;
}

export type FillStatus = 'ok' | 'low' | 'high';

/** Fill warning range from the domain facts: below 30% or above 80% metal warns; the bounds are ok. */
export const FILL_LOW = 0.3;
export const FILL_HIGH = 0.8;

const seedCache = new WeakMap<GridSpec, Map<number, Uint8Array>>();

function seedMask(N: number, spec: GridSpec): Uint8Array {
  if (!Number.isInteger(N) || !spec.grids.includes(N)) {
    throw new RangeError(`unsupported grid ${N}×${N}; supported grids are ${spec.grids.join(', ')}`);
  }
  let byN = seedCache.get(spec);
  if (byN === undefined) {
    byN = new Map();
    seedCache.set(spec, byN);
  }
  let mask = byN.get(N);
  if (mask === undefined) {
    const values = spec.seed_masks[String(N)];
    if (values?.length !== N * N) {
      throw new RangeError(`meta.json has no ${N}×${N} seed mask of ${N * N} values`);
    }
    mask = Uint8Array.from(values, (v) => (v === 1 ? 1 : 0));
    byN.set(N, mask);
  }
  return mask;
}

function index(grid: Grid, r: number, c: number): number {
  const { N } = grid;
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= N || c >= N) {
    throw new RangeError(`pixel (${r}, ${c}) is outside the ${N}×${N} grid`);
  }
  return r * N + c;
}

/** A new grid: all air except the seed pixels, which are metal. */
export function create(N: number, spec: GridSpec): Grid {
  const seed = seedMask(N, spec);
  return { N, cells: seed.slice(), seed };
}

export function get(grid: Grid, r: number, c: number): Cell {
  return grid.cells[index(grid, r, c)] === 1 ? 1 : 0;
}

export function isSeed(grid: Grid, r: number, c: number): boolean {
  return grid.seed[index(grid, r, c)] === 1;
}

/** Sets pixel (r, c). Returns the same grid for a seed pixel or when the value does not change. */
export function paint(grid: Grid, r: number, c: number, value: Cell): Grid {
  const raw: number = value; // runtime guard for callers outside the type system
  if (raw !== 0 && raw !== 1) throw new RangeError(`pixel value must be 0 or 1, got ${String(raw)}`);
  const k = index(grid, r, c);
  if (grid.seed[k] === 1 || grid.cells[k] === value) return grid;
  const cells = grid.cells.slice();
  cells[k] = value;
  return { N: grid.N, cells, seed: grid.seed };
}

/** Flips pixel (r, c). Returns the same grid for a seed pixel. */
export function toggle(grid: Grid, r: number, c: number): Grid {
  const k = index(grid, r, c);
  return paint(grid, r, c, grid.cells[k] === 1 ? 0 : 1);
}

/** True when any pixel differs from a fresh grid (metal outside the seed pixels). */
export function isEdited(grid: Grid): boolean {
  const { cells, seed } = grid;
  for (let k = 0; k < cells.length; k++) if (cells[k] !== seed[k]) return true;
  return false;
}

/** Metal fraction over all N² pixels, seed pixels included. */
export function fill(grid: Grid): number {
  let metal = 0;
  for (const v of grid.cells) metal += v;
  return metal / grid.cells.length;
}

export function fillStatus(value: number): FillStatus {
  if (!(value >= 0 && value <= 1)) throw new RangeError(`fill must be in [0, 1], got ${String(value)}`);
  if (value < FILL_LOW) return 'low';
  if (value > FILL_HIGH) return 'high';
  return 'ok';
}

/**
 * Seed pixels plus random free pixels, Math.round(targetFill * N²) metal pixels in total (never fewer
 * than the seeds). Deterministic for a given rng (e.g. mulberry32(seed)): a partial Fisher–Yates
 * shuffle of the free pixels.
 */
export function randomPattern(N: number, targetFill: number, rng: () => number, spec: GridSpec): Grid {
  if (!(targetFill >= 0 && targetFill <= 1)) {
    throw new RangeError(`target fill must be in [0, 1], got ${String(targetFill)}`);
  }
  const grid = create(N, spec);
  const free: number[] = [];
  grid.seed.forEach((s, k) => {
    if (s === 0) free.push(k);
  });
  const seedCount = N * N - free.length;
  const wanted = Math.min(free.length, Math.max(0, Math.round(targetFill * N * N) - seedCount));
  const cells = grid.cells;
  for (let i = 0; i < wanted; i++) {
    const j = i + Math.floor(rng() * (free.length - i));
    const picked = free[j] as number;
    free[j] = free[i] as number;
    free[i] = picked;
    cells[picked] = 1;
  }
  return grid;
}

/** Small seeded PRNG (mulberry32): reproducible values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
