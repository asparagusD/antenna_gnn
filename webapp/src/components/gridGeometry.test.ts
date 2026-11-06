import { describe, expect, it } from 'vitest';
import { cellAt, cellEdges, cellRect, lineCells, moveCursor } from './gridGeometry';

describe('cellAt (pointer -> cell)', () => {
  it('maps corners, centres and edges of a 500 px board with N = 25', () => {
    expect(cellAt(0, 0, 500, 25)).toEqual({ row: 0, col: 0 });
    expect(cellAt(10, 10, 500, 25)).toEqual({ row: 0, col: 0 });
    expect(cellAt(19.99, 0, 500, 25)).toEqual({ row: 0, col: 0 });
    expect(cellAt(20, 0, 500, 25)).toEqual({ row: 0, col: 1 });
    expect(cellAt(250, 250, 500, 25)).toEqual({ row: 12, col: 12 });
    expect(cellAt(499.99, 499.99, 500, 25)).toEqual({ row: 24, col: 24 });
  });

  it('gives the right and bottom edges to the last cell', () => {
    expect(cellAt(500, 500, 500, 25)).toEqual({ row: 24, col: 24 });
    expect(cellAt(500, 0, 500, 12)).toEqual({ row: 0, col: 11 });
  });

  it('returns null outside the board or for a degenerate size', () => {
    expect(cellAt(-0.01, 10, 500, 25)).toBeNull();
    expect(cellAt(10, 500.01, 500, 25)).toBeNull();
    expect(cellAt(10, 10, 0, 25)).toBeNull();
    expect(cellAt(Number.NaN, 10, 500, 25)).toBeNull();
  });

  it.each([12, 15, 25, 35, 45])(
    'every cell centre maps back to its own cell (N = %i, odd board width)',
    (N) => {
      const size = 613; // not a multiple of N
      for (let row = 0; row < N; row++) {
        for (let col = 0; col < N; col++) {
          const x = ((col + 0.5) * size) / N;
          const y = ((row + 0.5) * size) / N;
          expect(cellAt(x, y, size, N)).toEqual({ row, col });
        }
      }
    },
  );

  it('depends only on CSS geometry, not on the device pixel ratio', () => {
    // Pointer events report CSS pixels; the same point maps to the same cell whatever the DPR.
    expect(cellAt(123.4, 56.7, 450, 45)).toEqual(cellAt(123.4, 56.7, 450, 45));
    expect(cellAt(123.4, 56.7, 450, 45)).toEqual({ row: 5, col: 12 });
  });
});

describe('lineCells (drag interpolation)', () => {
  it('returns a single cell when start and end coincide', () => {
    expect(lineCells({ row: 3, col: 4 }, { row: 3, col: 4 })).toEqual([{ row: 3, col: 4 }]);
  });

  it('covers a horizontal run with no gaps, both ends included', () => {
    expect(lineCells({ row: 2, col: 2 }, { row: 2, col: 6 }).map((c) => c.col)).toEqual([2, 3, 4, 5, 6]);
  });

  it('runs backwards and vertically', () => {
    expect(lineCells({ row: 7, col: 1 }, { row: 3, col: 1 }).map((c) => c.row)).toEqual([7, 6, 5, 4, 3]);
  });

  it('steps one cell at a time along diagonals and steep lines (8-connected path)', () => {
    for (const [a, b] of [
      [
        { row: 0, col: 0 },
        { row: 5, col: 5 },
      ],
      [
        { row: 0, col: 0 },
        { row: 9, col: 2 },
      ],
      [
        { row: 10, col: 3 },
        { row: 1, col: 14 },
      ],
    ] as const) {
      const cells = lineCells(a, b);
      expect(cells[0]).toEqual(a);
      expect(cells.at(-1)).toEqual(b);
      for (let i = 1; i < cells.length; i++) {
        const prev = cells[i - 1];
        const cur = cells[i];
        if (prev === undefined || cur === undefined) throw new Error('missing cell');
        expect(Math.max(Math.abs(cur.row - prev.row), Math.abs(cur.col - prev.col))).toBe(1);
      }
    }
  });
});

describe('device-pixel cell rectangles', () => {
  it.each([
    [12, 600],
    [25, 613],
    [45, 1227],
  ])('N = %i over %i device px: adjacent cells share edges and tile the board exactly', (N, px) => {
    let x = 0;
    for (let i = 0; i < N; i++) {
      const [x0, x1] = cellEdges(i, px, N);
      expect(x0).toBe(x);
      expect(Number.isInteger(x0) && Number.isInteger(x1)).toBe(true);
      expect(x1 - x0).toBeGreaterThanOrEqual(Math.floor(px / N));
      x = x1;
    }
    expect(x).toBe(px);
  });

  it('cellRect combines column and row edges', () => {
    expect(cellRect({ row: 1, col: 2 }, 500, 25)).toEqual([40, 20, 20, 20]);
  });
});

describe('moveCursor (keyboard)', () => {
  it('moves one cell with the arrows and clamps at the edges', () => {
    expect(moveCursor({ row: 0, col: 0 }, 'ArrowUp', 12)).toEqual({ row: 0, col: 0 });
    expect(moveCursor({ row: 0, col: 0 }, 'ArrowDown', 12)).toEqual({ row: 1, col: 0 });
    expect(moveCursor({ row: 5, col: 11 }, 'ArrowRight', 12)).toEqual({ row: 5, col: 11 });
    expect(moveCursor({ row: 5, col: 5 }, 'ArrowLeft', 12)).toEqual({ row: 5, col: 4 });
  });

  it('jumps with Home/End/PageUp/PageDown and ignores other keys', () => {
    expect(moveCursor({ row: 5, col: 5 }, 'Home', 25)).toEqual({ row: 5, col: 0 });
    expect(moveCursor({ row: 5, col: 5 }, 'End', 25)).toEqual({ row: 5, col: 24 });
    expect(moveCursor({ row: 5, col: 5 }, 'PageUp', 25)).toEqual({ row: 0, col: 5 });
    expect(moveCursor({ row: 5, col: 5 }, 'PageDown', 25)).toEqual({ row: 24, col: 5 });
    expect(moveCursor({ row: 5, col: 5 }, 'a', 25)).toBeNull();
  });
});
