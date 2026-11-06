import { describe, expect, it } from 'vitest';
import committedMeta from '../../public/model/meta.json';
import { parseMeta } from '../model/meta';
import { freqGhz } from './analysis';
import { exportFilename, patternCsv, s11Csv } from './exportCsv';
import { create, fromCells, mulberry32, randomPattern } from './grid';

const meta = parseMeta(structuredClone(committedMeta));

describe('s11Csv', () => {
  it('a header and one row per frequency: GHz to 3 decimals, dB to 6', () => {
    const db = Float64Array.from(freqGhz, (f) => -f * 1.2345678);
    const lines = s11Csv(db).split('\n');
    expect(lines[0]).toBe('frequency_ghz,s11_db');
    expect(lines).toHaveLength(203); // header + 201 rows + trailing newline
    expect(lines[1]).toBe('1.000,-1.234568');
    expect(lines[201]).toBe('4.000,-4.938271');
    expect(lines[202]).toBe('');
  });

  it('rejects a curve that is not 201 values', () => {
    expect(() => s11Csv(new Float64Array(10))).toThrow(RangeError);
  });
});

describe('patternCsv', () => {
  it('N rows of N comma-separated 0/1 values, row-major as on the board', () => {
    const grid = randomPattern(12, 0.5, mulberry32(4), meta);
    const text = patternCsv(grid);
    const rows = text.trimEnd().split('\n');
    expect(rows).toHaveLength(12);
    rows.forEach((row, r) => {
      expect(row).toBe(Array.from(grid.cells.slice(r * 12, r * 12 + 12)).join(','));
    });
    expect(text.endsWith('\n')).toBe(true);
  });

  it('round-trips through fromCells', () => {
    const grid = randomPattern(25, 0.6, mulberry32(9), meta);
    const values = patternCsv(grid)
      .trimEnd()
      .split('\n')
      .flatMap((row) => row.split(',').map(Number));
    expect(Array.from(fromCells(25, values, meta).cells)).toEqual(Array.from(grid.cells));
  });
});

describe('exportFilename', () => {
  it('names the grid and the content', () => {
    expect(exportFilename(create(25, meta), 's11')).toBe('graphpatch_25x25_s11.csv');
    expect(exportFilename(create(45, meta), 'pattern')).toBe('graphpatch_45x45_pattern.csv');
  });
});
