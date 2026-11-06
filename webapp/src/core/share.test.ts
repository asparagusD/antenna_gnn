import { describe, expect, it } from 'vitest';
import committedMeta from '../../public/model/meta.json';
import { parseMeta } from '../model/meta';
import { create, fromCells, mulberry32, randomPattern, type Grid } from './grid';
import { decodeShare, encodeShare } from './share';

const meta = parseMeta(structuredClone(committedMeta));
const GRIDS = [12, 15, 25, 35, 45] as const;

function allMetal(N: number): Grid {
  return fromCells(N, new Array<number>(N * N).fill(1), meta);
}

function roundTrip(grid: Grid): Grid {
  const decoded = decodeShare(`#${encodeShare(grid)}`, meta);
  if (decoded === null || !decoded.ok) throw new Error(`decode failed: ${JSON.stringify(decoded)}`);
  return decoded.grid;
}

describe('share codec round trip', () => {
  it.each(GRIDS)('N = %i: seeds only, random 30/60/80%% and all metal come back exactly', (N) => {
    const rng = mulberry32(N);
    const grids = [
      create(N, meta),
      randomPattern(N, 0.3, rng, meta),
      randomPattern(N, 0.6, rng, meta),
      randomPattern(N, 0.8, rng, meta),
      allMetal(N),
    ];
    for (const grid of grids) {
      const back = roundTrip(grid);
      expect(back.N).toBe(N);
      expect(Array.from(back.cells)).toEqual(Array.from(grid.cells));
      expect(back.seed).toBe(grid.seed);
    }
  });

  it.each(GRIDS)('N = %i: format p=v1.N.<base64url of ceil(N²/8) bytes>, no padding', (N) => {
    const text = encodeShare(randomPattern(N, 0.5, mulberry32(7), meta));
    const match = /^p=v1\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(text);
    expect(match?.[1]).toBe(String(N));
    const bytes = Math.ceil((N * N) / 8);
    expect(match?.[2]?.length).toBe(Math.ceil((bytes * 4) / 3));
  });

  it('bit order: row-major, most significant bit first', () => {
    const cells = create(12, meta).cells.slice();
    cells[0] = 1; // pixel (0, 0) -> top bit of the first byte
    const text = encodeShare(fromCells(12, Array.from(cells), meta));
    expect(text.split('.')[2]?.startsWith('g')).toBe(true); // 0b100000 -> 'g'
  });
});

describe('decodeShare', () => {
  it('returns null when the hash holds no pattern', () => {
    expect(decodeShare('', meta)).toBeNull();
    expect(decodeShare('#', meta)).toBeNull();
    expect(decodeShare('#section-2', meta)).toBeNull();
  });

  it('accepts the hash with or without "#"', () => {
    const text = encodeShare(create(15, meta));
    expect(decodeShare(text, meta)?.ok).toBe(true);
    expect(decodeShare(`#${text}`, meta)?.ok).toBe(true);
  });

  const valid = encodeShare(randomPattern(25, 0.5, mulberry32(3), meta));
  const payload = valid.split('.')[2] ?? '';
  const seedHole = (() => {
    // Air on the first seed pixel: flip that bit off in an all-metal 25×25 pattern.
    const grid = create(25, meta);
    const k = grid.seed.indexOf(1);
    const bytes = new Uint8Array(Math.ceil(625 / 8)).fill(0xff);
    bytes[bytes.length - 1] = 0x80; // 625 = 78*8 + 1: only the top bit of the last byte is used
    bytes[k >> 3] = (bytes[k >> 3] ?? 0) & ~(0x80 >> (k & 7));
    const b64 = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `p=v1.25.${b64}`;
  })();

  it.each([
    ['unknown version', `p=v9.25.${payload}`, /not a GraphPatch share link/],
    ['unsupported grid', `p=v1.55.${payload}`, /55×55 is not supported/],
    ['truncated data', `p=v1.25.${payload.slice(0, -4)}`, /incomplete or damaged/],
    ['bad characters', `p=v1.25.${payload.slice(0, -1)}*`, /incomplete or damaged/],
    ['padding bits set', `p=v1.15.${'_'.repeat(39)}`, /incomplete or damaged/], // 225 bits in 29 bytes: 7 unused bits set
    ['air on a seed pixel', seedHole, /seed pixel/],
    ['garbage', 'p=hello', /not a GraphPatch share link/],
  ])('rejects %s with a friendly reason', (_, hash, reason) => {
    const result = decodeShare(hash, meta);
    expect(result?.ok).toBe(false);
    if (result !== null && !result.ok) expect(result.reason).toMatch(reason);
  });
});
