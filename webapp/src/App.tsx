import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { FillMeter } from './components/FillMeter';
import { GridEditor } from './components/GridEditor';
import { GridSizeSelector } from './components/GridSizeSelector';
import { ResultsPanel } from './components/ResultsPanel';
import { S11Chart } from './components/S11Chart';
import { ScopeNotice } from './components/ScopeNotice';
import { ValidityNote } from './components/ValidityNote';
import { analyse } from './core/analysis';
import { create, fill, fromCells, isEdited, type Grid } from './core/grid';
import {
  canRedo,
  canUndo,
  historyReducer,
  initHistory,
  type GridHistory,
  type HistoryAction,
} from './core/history';
import { usePrediction } from './hooks/usePrediction';
import { loadMeta, type ModelMeta } from './model/meta';
import { installTestHook, TEST_HOOKS_ENABLED } from './testHook';
import './App.css';

type MetaState =
  { status: 'loading' } | { status: 'ready'; meta: ModelMeta } | { status: 'error'; message: string };

const DEFAULT_N = 25;

function historyOrNull(state: GridHistory | null, action: HistoryAction): GridHistory | null {
  if (action.type === 'reset') return initHistory(action.grid);
  return state === null ? null : historyReducer(state, action);
}

/**
 * Core screen (C5): grid size, board with undo/redo, fill meter, live |S11| chart, results, scope
 * notice and validity note; starting points and sharing arrive in C5.5.
 */
export function App() {
  const [state, setState] = useState<MetaState>({ status: 'loading' });
  const [history, dispatch] = useReducer(historyOrNull, null);
  const prediction = usePrediction(history?.present ?? null);
  // Only ever set by the e2e test hook (testHook.ts); null in every real build.
  const [curveOverride, setCurveOverride] = useState<Float64Array | null>(null);

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
  const meta = state.status === 'ready' ? state.meta : null;
  useEffect(() => {
    if (!TEST_HOOKS_ENABLED || meta === null) return;
    return installTestHook({
      loadPattern: (N, cells) => {
        dispatch({ type: 'reset', grid: fromCells(N, cells, meta) });
      },
      setCurve: (db) => {
        setCurveOverride(db === null ? null : Float64Array.from(db));
      },
    });
  }, [meta]);

  const db = curveOverride ?? prediction.db;
  const bandCount = useMemo(() => (db === null ? 0 : analyse(db).bands.length), [db]);

  const changeSize = useCallback(
    (size: number) => {
      if (meta !== null) dispatch({ type: 'reset', grid: create(size, meta) });
    },
    [meta],
  );

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="topbar-title">GraphPatch</h1>
        {meta !== null && history !== null && (
          <GridSizeSelector
            sizes={meta.grids}
            value={history.present.N}
            edited={isEdited(history.present)}
            onChange={changeSize}
          />
        )}
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
                key={history.present.N}
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
              <FillMeter value={fill(history.present)} />
            </>
          )}
        </section>
        <section className="workspace-results" aria-label="Prediction">
          <S11Chart
            db={db}
            status={curveOverride === null ? prediction.status : 'ready'}
            error={prediction.error ?? undefined}
            onRetry={prediction.retry}
          />
          <ResultsPanel db={db} inferMs={curveOverride === null ? prediction.inferMs : null} />
          {history !== null && <ScopeNotice bands={bandCount} N={history.present.N} />}
          {meta !== null && history !== null && <ValidityNote N={history.present.N} scope={meta.scope} />}
        </section>
      </main>
    </div>
  );
}
