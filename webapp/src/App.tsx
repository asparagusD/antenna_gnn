import { useEffect, useState } from 'react';
import { GridEditor } from './components/GridEditor';
import { create, type Grid } from './core/grid';
import { loadMeta, type ModelMeta } from './model/meta';
import './App.css';

type MetaState =
  { status: 'loading' } | { status: 'ready'; meta: ModelMeta } | { status: 'error'; message: string };

const DEFAULT_N = 25;

/** Core screen (C5): the board now; plot, results and controls arrive in C5.2-C5.5. */
export function App() {
  const [state, setState] = useState<MetaState>({ status: 'loading' });
  const [grid, setGrid] = useState<Grid | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMeta()
      .then((meta) => {
        if (cancelled) return;
        setState({ status: 'ready', meta });
        setGrid(create(DEFAULT_N, meta));
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
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
          {state.status === 'ready' && grid !== null && (
            <GridEditor grid={grid} spec={state.meta} onChange={setGrid} />
          )}
        </section>
      </main>
    </div>
  );
}
