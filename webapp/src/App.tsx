import { useCallback, useEffect, useReducer, useState } from 'react';
import { GridEditor } from './components/GridEditor';
import { create, type Grid } from './core/grid';
import {
  canRedo,
  canUndo,
  historyReducer,
  initHistory,
  type GridHistory,
  type HistoryAction,
} from './core/history';
import { loadMeta, type ModelMeta } from './model/meta';
import './App.css';

type MetaState =
  { status: 'loading' } | { status: 'ready'; meta: ModelMeta } | { status: 'error'; message: string };

const DEFAULT_N = 25;

function historyOrNull(state: GridHistory | null, action: HistoryAction): GridHistory | null {
  if (action.type === 'reset') return initHistory(action.grid);
  return state === null ? null : historyReducer(state, action);
}

/** Core screen (C5): the board with undo/redo now; plot, results and controls arrive in C5.2-C5.5. */
export function App() {
  const [state, setState] = useState<MetaState>({ status: 'loading' });
  const [history, dispatch] = useReducer(historyOrNull, null);

  useEffect(() => {
    let cancelled = false;
    loadMeta()
      .then((meta) => {
        if (cancelled) return;
        setState({ status: 'ready', meta });
        dispatch({ type: 'reset', grid: create(DEFAULT_N, meta) });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z and Ctrl+Y redo, wherever focus is on the page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      } else if (key === 'y' && event.ctrlKey) {
        event.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const setGrid = useCallback((grid: Grid) => {
    dispatch({ type: 'set', grid });
  }, []);
  const beginStroke = useCallback(() => {
    dispatch({ type: 'begin' });
  }, []);
  const endStroke = useCallback(() => {
    dispatch({ type: 'end' });
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="topbar-title">GraphPatch</h1>
        <p className="topbar-status" role="status">
          {state.status === 'loading' && 'loading model meta…'}
          {state.status === 'ready' && `model meta loaded: ${state.meta.grids.length} grids`}
          {state.status === 'error' && `model meta failed to load: ${state.message}`}
        </p>
      </header>
      <main className="workspace">
        <section className="workspace-board" aria-label="Metal pattern">
          {state.status === 'ready' && history !== null && (
            <>
              <GridEditor
                grid={history.present}
                spec={state.meta}
                onChange={setGrid}
                onStrokeStart={beginStroke}
                onStrokeEnd={endStroke}
              />
              <div className="tools" role="toolbar" aria-label="Board tools">
                <button
                  type="button"
                  className="tool"
                  disabled={!canUndo(history)}
                  aria-keyshortcuts="Control+Z Meta+Z"
                  onClick={() => {
                    dispatch({ type: 'undo' });
                  }}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="tool"
                  disabled={!canRedo(history)}
                  aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
                  onClick={() => {
                    dispatch({ type: 'redo' });
                  }}
                >
                  Redo
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
