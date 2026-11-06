import { useEffect, useState } from 'react';
import { loadMeta, type ModelMeta } from './model/meta';

type MetaState =
  | { status: 'loading' }
  | { status: 'ready'; meta: ModelMeta }
  | { status: 'error'; message: string };

/** Placeholder page (C3.1): proves the model metadata loads; the real UI arrives in C5. */
export function App() {
  const [state, setState] = useState<MetaState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadMeta()
      .then((meta) => {
        if (!cancelled) setState({ status: 'ready', meta });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Antenna S11 surrogate</h1>
      <p role="status">
        {state.status === 'loading' && 'loading model meta…'}
        {state.status === 'ready' && `model meta loaded: ${state.meta.grids.length} grids`}
        {state.status === 'error' && `model meta failed to load: ${state.message}`}
      </p>
    </main>
  );
}
