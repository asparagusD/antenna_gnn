/**
 * Main-thread client for the inference worker (C5.3). Pairs with predictServer.ts (protocol there).
 *
 * - request(grid) posts a copy of the cells with a new, increasing requestId (latest wins).
 * - Results and errors for anything but the latest request are ignored; 'dropped' needs no action.
 * - pending() is true from a request until the latest request's result or error arrives, so the
 *   chart can show "updating" while it keeps the previous curve.
 * - latencyMs is the time from request() to the result arriving on the main thread.
 * - retry() restarts a worker whose model failed to load, or resends the latest grid after a failed
 *   prediction.
 */
import type { WorkerResponse } from './predictServer';

export interface WorkerLike {
  postMessage: (message: unknown, transfer: Transferable[]) => void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate: () => void;
}

export interface GridCells {
  N: number;
  cells: Uint8Array;
}

export type ClientEvent =
  | { type: 'ready'; loadMs: number }
  | {
      type: 'result';
      requestId: number;
      s11: Float64Array;
      latencyMs: number;
      inferMs: number;
      sentAt: number;
    }
  | { type: 'error'; phase: 'init' | 'predict'; message: string };

export interface PredictClientOptions {
  createWorker: () => WorkerLike;
  now?: () => number;
}

export interface PredictClient {
  request: (grid: GridCells) => number;
  subscribe: (listener: (event: ClientEvent) => void) => () => void;
  pending: () => boolean;
  retry: () => void;
  dispose: () => void;
}

export function createPredictClient(options: PredictClientOptions): PredictClient {
  const now = options.now ?? (() => performance.now());
  const listeners = new Set<(event: ClientEvent) => void>();
  let nextId = 1;
  let latest: { id: number; grid: GridCells; sentAt: number } | null = null;
  let waiting = false;
  let lastError: 'init' | 'predict' | null = null;
  let disposed = false;
  let worker: WorkerLike;

  const emit = (event: ClientEvent) => {
    if (disposed) return;
    for (const listener of listeners) listener(event);
  };

  const onMessage = (event: MessageEvent) => {
    const message = event.data as WorkerResponse;
    switch (message.type) {
      case 'ready':
        emit({ type: 'ready', loadMs: message.loadMs });
        return;
      case 'dropped':
        return;
      case 'result':
        if (latest === null || message.requestId !== latest.id) return;
        waiting = false;
        lastError = null;
        emit({
          type: 'result',
          requestId: message.requestId,
          s11: message.s11,
          latencyMs: now() - latest.sentAt,
          inferMs: message.ms,
          sentAt: latest.sentAt,
        });
        return;
      case 'error':
        if (message.phase === 'predict' && (latest === null || message.requestId !== latest.id)) return;
        waiting = false;
        lastError = message.phase;
        emit({ type: 'error', phase: message.phase, message: message.message });
    }
  };

  const start = () => {
    worker = options.createWorker();
    worker.onmessage = onMessage;
    worker.onerror = (event) => {
      waiting = false;
      lastError = 'init';
      emit({ type: 'error', phase: 'init', message: event.message || 'the inference worker stopped' });
    };
  };

  const send = (grid: GridCells): number => {
    const id = nextId++;
    const cells = grid.cells.slice();
    latest = { id, grid, sentAt: now() };
    waiting = true;
    worker.postMessage({ type: 'predict', requestId: id, N: grid.N, cells }, [cells.buffer]);
    return id;
  };

  start();

  return {
    request: send,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    pending: () => waiting,
    retry() {
      if (lastError === 'init') {
        worker.terminate();
        start();
      }
      lastError = null;
      if (latest !== null) send(latest.grid);
    },
    dispose() {
      disposed = true;
      worker.terminate();
      listeners.clear();
    },
  };
}
