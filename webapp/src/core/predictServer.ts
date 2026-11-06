/**
 * Message handler for the inference Web Worker (C4.4), independent of the worker global so it can be
 * tested with a mocked session (predictServer.test.ts). worker.ts wires it to `self`.
 *
 * Protocol (main thread -> worker):
 *   {type: 'predict', requestId, N, cells: Uint8Array(N*N)}
 * Worker -> main thread:
 *   {type: 'ready', loadMs}                                  model loaded
 *   {type: 'result', requestId, s11: Float64Array(201), ms}  |S11| in dB; s11's buffer is transferred
 *   {type: 'dropped', requestId, supersededBy}               replaced before it ran (latest wins)
 *   {type: 'error', requestId | null, phase, message}        'init' (model load) or 'predict'
 *
 * Latest wins: one prediction runs at a time; while it runs, each new request replaces the waiting
 * one, which is answered with 'dropped' and never computed. The running prediction still completes;
 * the main thread ignores results older than its latest request.
 */
import type { ModelMeta } from '../model/meta';
import { buildGraph } from './graph';
import { create, type Grid } from './grid';
import { predict, type ModelSession } from './infer';

export interface PredictRequest {
  type: 'predict';
  requestId: number;
  N: number;
  cells: Uint8Array;
}

export type WorkerRequest = PredictRequest;

export type WorkerResponse =
  | { type: 'ready'; loadMs: number }
  | { type: 'result'; requestId: number; s11: Float64Array; ms: number }
  | { type: 'dropped'; requestId: number; supersededBy: number }
  | { type: 'error'; requestId: number | null; phase: 'init' | 'predict'; message: string };

export interface PredictServerOptions {
  /** Loads the model and its metadata (once, at start-up). */
  init: () => Promise<{ session: ModelSession; meta: ModelMeta }>;
  post: (message: WorkerResponse, transfer: Transferable[]) => void;
  now?: () => number;
  predictFn?: typeof predict;
}

export interface PredictServer {
  handle: (message: unknown) => void;
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The request's grid, validated against meta.json; throws RangeError with a readable message. */
function gridFor(request: PredictRequest, meta: ModelMeta): Grid {
  const grid = create(request.N, meta); // throws for unsupported grids
  const { cells } = request;
  if (!(cells instanceof Uint8Array) || cells.length !== request.N * request.N) {
    throw new RangeError(`cells must be a Uint8Array of ${String(request.N * request.N)} values`);
  }
  for (let k = 0; k < cells.length; k++) {
    const v = cells[k];
    if (v !== 0 && v !== 1) throw new RangeError('cells must contain only 0/1 values');
    if (v === 0 && grid.seed[k] === 1) {
      throw new RangeError(
        `seed pixel (${String(Math.floor(k / request.N))}, ${String(k % request.N)}) must be metal`,
      );
    }
  }
  return { ...grid, cells };
}

export function createPredictServer(options: PredictServerOptions): PredictServer {
  const { init, post } = options;
  const now = options.now ?? (() => performance.now());
  const predictFn = options.predictFn ?? predict;

  let model: { session: ModelSession; meta: ModelMeta } | null = null;
  let initError: string | null = null;
  let pending: PredictRequest | null = null;
  let running = false;

  const started = now();
  const ready = init().then(
    (loaded) => {
      model = loaded;
      post({ type: 'ready', loadMs: now() - started }, []);
    },
    (error: unknown) => {
      initError = errorText(error);
      post({ type: 'error', requestId: null, phase: 'init', message: initError }, []);
    },
  );

  async function run(request: PredictRequest): Promise<void> {
    await ready;
    if (model === null) {
      post(
        {
          type: 'error',
          requestId: request.requestId,
          phase: 'init',
          message: initError ?? 'model not loaded',
        },
        [],
      );
      return;
    }
    const t0 = now();
    try {
      const grid = gridFor(request, model.meta);
      const s11 = await predictFn(model.session, buildGraph(grid, model.meta), model.meta);
      post({ type: 'result', requestId: request.requestId, s11, ms: now() - t0 }, [s11.buffer]);
    } catch (error) {
      post({ type: 'error', requestId: request.requestId, phase: 'predict', message: errorText(error) }, []);
    }
  }

  function pump(): void {
    if (running || pending === null) return;
    const request = pending;
    pending = null;
    running = true;
    void run(request).finally(() => {
      running = false;
      pump();
    });
  }

  function handle(message: unknown): void {
    if (!isRecord(message) || message.type !== 'predict') {
      post(
        {
          type: 'error',
          requestId: null,
          phase: 'predict',
          message: `unknown message ${JSON.stringify(isRecord(message) ? message.type : message)}`,
        },
        [],
      );
      return;
    }
    const { requestId, N, cells } = message;
    if (typeof requestId !== 'number' || !Number.isFinite(requestId)) {
      post(
        { type: 'error', requestId: null, phase: 'predict', message: 'predict needs a numeric requestId' },
        [],
      );
      return;
    }
    const request: PredictRequest = { type: 'predict', requestId, N: Number(N), cells: cells as Uint8Array };
    if (model !== null) {
      // Validate up front so a bad request is answered at once instead of waiting its turn.
      try {
        gridFor(request, model.meta);
      } catch (error) {
        post({ type: 'error', requestId, phase: 'predict', message: errorText(error) }, []);
        return;
      }
    }
    if (pending !== null)
      post({ type: 'dropped', requestId: pending.requestId, supersededBy: requestId }, []);
    pending = request;
    pump();
  }

  return { handle };
}
