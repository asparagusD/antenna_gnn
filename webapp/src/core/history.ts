/**
 * Undo/redo history for the board (C5.1 critique P1). Pure reducer: one history entry per pointer
 * stroke (press to release) or keyboard edit, however many pixels it painted.
 *
 * The editor brackets every edit with 'begin' / 'end'; 'set' updates the present grid. A 'set' outside
 * a stroke counts as one edit on its own. 'reset' (e.g. a grid-size change) starts a fresh history.
 */
import type { Grid } from './grid';

export const HISTORY_LIMIT = 100;

export interface GridHistory {
  past: readonly Grid[];
  present: Grid;
  future: readonly Grid[];
  /** The grid when the current stroke began; null between strokes. */
  strokeStart: Grid | null;
}

export type HistoryAction =
  | { type: 'set'; grid: Grid }
  | { type: 'begin' }
  | { type: 'end' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; grid: Grid };

export function initHistory(grid: Grid): GridHistory {
  return { past: [], present: grid, future: [], strokeStart: null };
}

function commit(state: GridHistory, before: Grid, after: Grid): GridHistory {
  if (before === after) return { ...state, present: after, strokeStart: null };
  return {
    past: [...state.past, before].slice(-HISTORY_LIMIT),
    present: after,
    future: [],
    strokeStart: null,
  };
}

export function historyReducer(state: GridHistory, action: HistoryAction): GridHistory {
  switch (action.type) {
    case 'set':
      if (action.grid === state.present) return state;
      return state.strokeStart === null
        ? commit(state, state.present, action.grid)
        : { ...state, present: action.grid };
    case 'begin':
      return state.strokeStart === null ? { ...state, strokeStart: state.present } : state;
    case 'end':
      return state.strokeStart === null ? state : commit(state, state.strokeStart, state.present);
    case 'undo': {
      const previous = state.past.at(-1);
      if (previous === undefined || state.strokeStart !== null) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        strokeStart: null,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (next === undefined || state.strokeStart !== null) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
        strokeStart: null,
      };
    }
    case 'reset':
      return initHistory(action.grid);
  }
}

export const canUndo = (state: GridHistory): boolean => state.past.length > 0 && state.strokeStart === null;
export const canRedo = (state: GridHistory): boolean => state.future.length > 0 && state.strokeStart === null;
