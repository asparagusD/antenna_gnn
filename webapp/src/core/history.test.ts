import { describe, expect, it } from 'vitest';
import committedMeta from '../../public/model/meta.json';
import { parseMeta } from '../model/meta';
import { create, paint, type Grid } from './grid';
import {
  canRedo,
  canUndo,
  HISTORY_LIMIT,
  historyReducer,
  initHistory,
  type GridHistory,
  type HistoryAction,
} from './history';

const meta = parseMeta(structuredClone(committedMeta));
const base = create(12, meta);

function run(state: GridHistory, ...actions: HistoryAction[]): GridHistory {
  return actions.reduce(historyReducer, state);
}

/** A stroke that paints the given free cells of row 0, as the editor does: begin, one set per cell, end. */
function stroke(state: GridHistory, cols: number[]): GridHistory {
  let s = historyReducer(state, { type: 'begin' });
  let grid: Grid = s.present;
  for (const col of cols) {
    grid = paint(grid, 0, col, 1);
    s = historyReducer(s, { type: 'set', grid });
  }
  return historyReducer(s, { type: 'end' });
}

const metal = (g: Grid) => g.cells.reduce((sum, v) => sum + v, 0);

describe('historyReducer', () => {
  it('starts with nothing to undo or redo', () => {
    const s = initHistory(base);
    expect(s.present).toBe(base);
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(false);
  });

  it('records a whole stroke as one entry and undoes it in one step', () => {
    const s = stroke(initHistory(base), [0, 1, 2, 3]);
    expect(metal(s.present)).toBe(metal(base) + 4);
    expect(s.past).toHaveLength(1);
    const undone = run(s, { type: 'undo' });
    expect(undone.present).toBe(base);
    expect(canRedo(undone)).toBe(true);
    expect(run(undone, { type: 'redo' }).present).toBe(s.present);
  });

  it('a stroke that changes nothing (e.g. only seed pixels) adds no entry', () => {
    const s = run(initHistory(base), { type: 'begin' }, { type: 'set', grid: base }, { type: 'end' });
    expect(s.past).toHaveLength(0);
  });

  it('a new edit after undo clears the redo stack', () => {
    let s = stroke(initHistory(base), [0]);
    s = run(s, { type: 'undo' });
    s = stroke(s, [5]);
    expect(canRedo(s)).toBe(false);
    expect(s.past).toHaveLength(1);
  });

  it('a set outside a stroke is its own entry', () => {
    const edited = paint(base, 0, 0, 1);
    const s = run(initHistory(base), { type: 'set', grid: edited });
    expect(s.past).toEqual([base]);
  });

  it('ignores undo and redo in the middle of a stroke', () => {
    let s = stroke(initHistory(base), [0]);
    s = run(s, { type: 'begin' });
    expect(canUndo(s)).toBe(false);
    expect(run(s, { type: 'undo' })).toBe(s);
  });

  it(`keeps at most ${String(HISTORY_LIMIT)} entries`, () => {
    let s = initHistory(base);
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      // Toggle pixel (0, 0) each time: every edit is a real change and its own entry.
      s = run(s, { type: 'set', grid: paint(s.present, 0, 0, s.present.cells[0] === 1 ? 0 : 1) });
    }
    expect(s.past).toHaveLength(HISTORY_LIMIT);
  });

  it('reset starts a fresh history', () => {
    const other = create(15, meta);
    const s = run(stroke(initHistory(base), [0, 1]), { type: 'reset', grid: other });
    expect(s).toEqual(initHistory(other));
  });
});
