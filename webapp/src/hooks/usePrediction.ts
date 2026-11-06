/**
 * Live prediction for the board (C5.3): every grid change is sent to the inference worker; the worker
 * runs latest-wins, and results for anything but the latest grid are ignored (predictClient.ts).
 *
 * Status for the chart: 'loading' until the model is ready, 'updating' while the shown curve belongs to
 * an older grid, 'error' after a failed load or prediction (retry() recovers), otherwise 'ready'.
 *
 * Each applied result is recorded as the User Timing measure "graphpatch:predict" (from the request to
 * the first animation frame after the result arrived), so perceived latency can be measured in a real
 * browser (scripts/measure-latency.mjs).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartStatus } from '../components/S11Chart';
import { createPredictClient, type PredictClient, type WorkerLike } from '../core/predictClient';
import type { Grid } from '../core/grid';

export const PREDICT_MEASURE = 'graphpatch:predict';

interface State {
  model: 'loading' | 'ready' | 'error';
  db: Float64Array | null;
  /** The grid the shown curve was computed for. */
  answered: Grid | null;
  error: string | null;
}

export interface Prediction {
  status: ChartStatus;
  db: Float64Array | null;
  error: string | null;
  retry: () => void;
}

const createWorker = (): WorkerLike =>
  new Worker(new URL('../core/worker.ts', import.meta.url), { type: 'module' });

export function usePrediction(grid: Grid | null): Prediction {
  const [state, setState] = useState<State>(() =>
    typeof Worker === 'undefined'
      ? {
          model: 'error',
          db: null,
          answered: null,
          error: 'this browser cannot run the model (no Web Workers)',
        }
      : { model: 'loading', db: null, answered: null, error: null },
  );
  const clientRef = useRef<PredictClient | null>(null);
  const requested = useRef<Grid | null>(null);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const client = createPredictClient({ createWorker });
    clientRef.current = client;
    const unsubscribe = client.subscribe((event) => {
      if (event.type === 'ready') {
        setState((s) => ({ ...s, model: 'ready', error: null }));
      } else if (event.type === 'result') {
        const answered = requested.current;
        setState((s) => ({ ...s, model: 'ready', db: event.s11, answered, error: null }));
        requestAnimationFrame(() => {
          performance.clearMeasures(PREDICT_MEASURE);
          performance.measure(PREDICT_MEASURE, {
            start: event.sentAt,
            end: performance.now(),
            detail: { inferMs: event.inferMs },
          });
        });
      } else {
        setState((s) => ({ ...s, model: event.phase === 'init' ? 'error' : s.model, error: event.message }));
      }
    });
    if (requested.current !== null) client.request(requested.current);
    return () => {
      unsubscribe();
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (grid === null) return;
    requested.current = grid;
    clientRef.current?.request(grid);
  }, [grid]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, model: s.model === 'error' ? 'loading' : s.model, error: null }));
    clientRef.current?.retry();
  }, []);

  const status: ChartStatus =
    state.error !== null
      ? 'error'
      : state.model === 'loading'
        ? 'loading'
        : grid !== null && state.answered !== grid
          ? 'updating'
          : 'ready';

  return { status, db: state.db, error: state.error, retry };
}
