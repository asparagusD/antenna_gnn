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

export type ModelState = 'loading' | 'ready' | 'error' | 'unsupported';

/**
 * What went wrong: the browser lacks WebAssembly or Web Workers (retrying cannot help), the model did not
 * load, or one prediction failed. detail is the technical message, for engineers.
 */
export interface PredictionError {
  kind: 'unsupported' | 'load' | 'predict';
  detail: string;
}

/** Feature check before starting the worker: onnxruntime-web needs WebAssembly inside a Web Worker. */
function missingFeature(): string | null {
  if (typeof Worker === 'undefined') return 'no Web Workers';
  if (typeof WebAssembly !== 'object' || typeof WebAssembly.instantiate !== 'function')
    return 'no WebAssembly';
  return null;
}

interface State {
  model: ModelState;
  db: Float64Array | null;
  /** The grid the shown curve was computed for. */
  answered: Grid | null;
  /** The worker's inference time for the shown curve, in ms. */
  inferMs: number | null;
  error: PredictionError | null;
}

export interface Prediction {
  status: ChartStatus;
  /** The model itself (not one prediction): loading, ready, failed to load, or unsupported here. */
  model: ModelState;
  db: Float64Array | null;
  inferMs: number | null;
  error: PredictionError | null;
  retry: () => void;
}

const createWorker = (): WorkerLike =>
  new Worker(new URL('../core/worker.ts', import.meta.url), { type: 'module' });

export function usePrediction(grid: Grid | null): Prediction {
  const [state, setState] = useState<State>(() => {
    const missing = missingFeature();
    return missing === null
      ? { model: 'loading', db: null, answered: null, inferMs: null, error: null }
      : {
          model: 'unsupported',
          db: null,
          answered: null,
          inferMs: null,
          error: { kind: 'unsupported', detail: missing },
        };
  });
  const clientRef = useRef<PredictClient | null>(null);
  const requested = useRef<Grid | null>(null);

  useEffect(() => {
    if (missingFeature() !== null) return;
    const client = createPredictClient({ createWorker });
    clientRef.current = client;
    const unsubscribe = client.subscribe((event) => {
      if (event.type === 'ready') {
        setState((s) => ({ ...s, model: 'ready', error: null }));
      } else if (event.type === 'result') {
        const answered = requested.current;
        setState((s) => ({
          ...s,
          model: 'ready',
          db: event.s11,
          answered,
          inferMs: event.inferMs,
          error: null,
        }));
        requestAnimationFrame(() => {
          performance.clearMeasures(PREDICT_MEASURE);
          performance.measure(PREDICT_MEASURE, {
            start: event.sentAt,
            end: performance.now(),
            detail: { inferMs: event.inferMs },
          });
        });
      } else {
        setState((s) => ({
          ...s,
          model: event.phase === 'init' ? 'error' : s.model,
          error: { kind: event.phase === 'init' ? 'load' : 'predict', detail: event.message },
        }));
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

  return { status, model: state.model, db: state.db, inferMs: state.inferMs, error: state.error, retry };
}
