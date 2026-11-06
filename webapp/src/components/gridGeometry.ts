/**
 * Pure geometry for the canvas grid editor: pointer position -> cell, the cells a fast drag passes
 * through, and device-pixel-aligned cell rectangles so the board stays crisp at any DPR.
 */

export interface Cell {
  row: number;
  col: number;
}

/**
 * The cell under a point given in CSS pixels relative to the board's top-left corner, for a square
 * board `size` CSS pixels wide with N cells per side. Points outside the board return null; the
 * right and bottom edges belong to the last cell.
 */
export function cellAt(x: number, y: number, size: number, N: number): Cell | null {
  if (!(size > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > size || y > size) return null;
  const col = Math.min(N - 1, Math.floor((x / size) * N));
  const row = Math.min(N - 1, Math.floor((y / size) * N));
  return { row, col };
}

/** Every cell on the straight line from `a` to `b`, both included (Bresenham), so fast drags leave no gaps. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  let { row, col } = a;
  const dRow = Math.abs(b.row - a.row);
  const dCol = Math.abs(b.col - a.col);
  const sRow = a.row < b.row ? 1 : -1;
  const sCol = a.col < b.col ? 1 : -1;
  let err = dCol - dRow;
  for (;;) {
    cells.push({ row, col });
    if (row === b.row && col === b.col) return cells;
    const e2 = 2 * err;
    if (e2 > -dRow) {
      err -= dRow;
      col += sCol;
    }
    if (e2 < dCol) {
      err += dCol;
      row += sRow;
    }
  }
}

/** Device-pixel edges of cell index `i` on a board `devicePx` wide with N cells: adjacent cells share edges. */
export function cellEdges(i: number, devicePx: number, N: number): [number, number] {
  return [Math.round((i * devicePx) / N), Math.round(((i + 1) * devicePx) / N)];
}

/** Device-pixel rectangle [x, y, width, height] of a cell. */
export function cellRect(cell: Cell, devicePx: number, N: number): [number, number, number, number] {
  const [x0, x1] = cellEdges(cell.col, devicePx, N);
  const [y0, y1] = cellEdges(cell.row, devicePx, N);
  return [x0, y0, x1 - x0, y1 - y0];
}

/** Moves a keyboard cursor; arrows step by one, Home/End jump to the row ends, PageUp/PageDown to the column ends. */
export function moveCursor(cell: Cell, key: string, N: number): Cell | null {
  const clamp = (v: number) => Math.max(0, Math.min(N - 1, v));
  switch (key) {
    case 'ArrowUp':
      return { row: clamp(cell.row - 1), col: cell.col };
    case 'ArrowDown':
      return { row: clamp(cell.row + 1), col: cell.col };
    case 'ArrowLeft':
      return { row: cell.row, col: clamp(cell.col - 1) };
    case 'ArrowRight':
      return { row: cell.row, col: clamp(cell.col + 1) };
    case 'Home':
      return { row: cell.row, col: 0 };
    case 'End':
      return { row: cell.row, col: N - 1 };
    case 'PageUp':
      return { row: 0, col: cell.col };
    case 'PageDown':
      return { row: N - 1, col: cell.col };
    default:
      return null;
  }
}
