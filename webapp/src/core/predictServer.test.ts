// @vitest-environment node
import { describe, expect, it } from 'vitest';
import committedMeta from '../../public/model/meta.json';
import { parseMeta, type ModelMeta } from '../model/meta';
import { create } from './grid';
import type { ModelSession } from './infer';
import { createPredictServer, type WorkerResponse } from './predictServer';

const meta: ModelMeta = parseMeta(structuredClone(committedMeta));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A mocked onnxruntime session: each run() waits for the test to release it, then returns z = k-th constant. */
function mockSession() {
  const calls: { numNodes: number; release: () => void; fail: (e: unknown) => void }[] = [];
  const session = {
    inputNames: ['x', 'edge_index', 'edge_attr'],
    outputNames: ['z'],
    run: (feeds: Record<string, { dims: readonly number[] }>) => {
      const gate = deferred<void>();
      const value = calls.length + 1;
      calls.push({
        numNodes: feeds.x?.dims[0] ?? -1,
        release: () => {
          gate.resolve();
        },
        fail: gate.reject,
      });
      return gate.promise.then(() => ({
        z: {
          type: 'float32',
          dims: [1, 201],
          data: new Float32Array(201).fill(value),
          dispose: () => undefined,
        },
      }));
    },
  };
  return { session: session as unknown as ModelSession, calls };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(init?: () => Promise<{ session: ModelSession; meta: ModelMeta }>) {
  const { session, calls } = mockSession();
  const posted: { message: WorkerResponse; transfer: Transferable[] }[] = [];
  let clock = 0;
  const server = createPredictServer({
    init: init ?? (() => Promise.resolve({ session, meta })),
    post: (message, transfer) => posted.push({ message, transfer }),
    now: () => (clock += 5),
  });
  const types = () => posted.map((p) => p.message.type);
  return { server, calls, posted, types };
}

const cells = (N: number) => create(N, meta).cells.slice();

describe('predict server protocol', () => {
  it('announces readiness, then answers a predict request with s11 in dB and its time', async () => {
    const { server, calls, posted } = setup();
    await tick();
    expect(posted[0]?.message).toEqual({ type: 'ready', loadMs: 5 });
    server.handle({ type: 'predict', requestId: 1, N: 12, cells: cells(12) });
    await tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.numNodes).toBe(145);
    calls[0]?.release();
    await tick();
    const result = posted[1];
    expect(result?.message.type).toBe('result');
    if (result?.message.type !== 'result') throw new Error('no result');
    expect(result.message.requestId).toBe(1);
    expect(result.message.ms).toBe(5);
    expect(result.message.s11).toBeInstanceOf(Float64Array);
    expect(result.message.s11).toHaveLength(201);
    // z = 1 everywhere -> dB = std + mean
    for (let k = 0; k < 201; k++) {
      expect(result.message.s11[k]).toBeCloseTo((meta.s11_std[k] ?? 0) + (meta.s11_mean[k] ?? 0), 12);
    }
    expect(result.transfer).toEqual([result.message.s11.buffer]);
  });

  it('latest wins: requests that arrive while one is running replace each other; replaced ones are dropped', async () => {
    const { server, calls, posted, types } = setup();
    await tick();
    server.handle({ type: 'predict', requestId: 1, N: 12, cells: cells(12) });
    await tick();
    server.handle({ type: 'predict', requestId: 2, N: 12, cells: cells(12) });
    server.handle({ type: 'predict', requestId: 3, N: 15, cells: cells(15) });
    server.handle({ type: 'predict', requestId: 4, N: 25, cells: cells(25) });
    expect(posted.filter((p) => p.message.type === 'dropped').map((p) => p.message)).toEqual([
      { type: 'dropped', requestId: 2, supersededBy: 3 },
      { type: 'dropped', requestId: 3, supersededBy: 4 },
    ]);
    calls[0]?.release();
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.numNodes).toBe(626); // request 4 (25x25) runs next; 2 and 3 never ran
    calls[1]?.release();
    await tick();
    const results = posted.filter((p) => p.message.type === 'result').map((p) => p.message);
    expect(results.map((m) => (m.type === 'result' ? m.requestId : -1))).toEqual([1, 4]);
    expect(types()).toEqual(['ready', 'dropped', 'dropped', 'result', 'result']);
  });

  it('queues a request that arrives before the model is ready', async () => {
    const gate = deferred<{ session: ModelSession; meta: ModelMeta }>();
    const { session, calls } = mockSession();
    const posted: WorkerResponse[] = [];
    const server = createPredictServer({
      init: () => gate.promise,
      post: (m) => posted.push(m),
      now: () => 0,
    });
    server.handle({ type: 'predict', requestId: 7, N: 12, cells: cells(12) });
    await tick();
    expect(posted).toEqual([]);
    gate.resolve({ session, meta });
    await tick();
    expect(calls).toHaveLength(1);
    calls[0]?.release();
    await tick();
    expect(posted.map((m) => m.type)).toEqual(['ready', 'result']);
  });

  it('reports a failed model load once, then an error for each request', async () => {
    const { server, posted } = setup(() => Promise.reject(new Error('no WebAssembly')));
    await tick();
    expect(posted[0]?.message).toEqual({
      type: 'error',
      requestId: null,
      phase: 'init',
      message: 'no WebAssembly',
    });
    server.handle({ type: 'predict', requestId: 1, N: 12, cells: cells(12) });
    await tick();
    expect(posted[1]?.message).toMatchObject({ type: 'error', requestId: 1, phase: 'init' });
  });

  it('reports an inference failure for that request and keeps serving', async () => {
    const { server, calls, posted } = setup();
    await tick();
    server.handle({ type: 'predict', requestId: 1, N: 12, cells: cells(12) });
    await tick();
    calls[0]?.fail(new Error('wasm trap'));
    await tick();
    expect(posted[1]?.message).toEqual({
      type: 'error',
      requestId: 1,
      phase: 'predict',
      message: 'wasm trap',
    });
    server.handle({ type: 'predict', requestId: 2, N: 12, cells: cells(12) });
    await tick();
    calls[1]?.release();
    await tick();
    expect(posted[2]?.message.type).toBe('result');
  });

  it.each([
    ['an unknown message type', { type: 'hello' }, null, /unknown message/],
    ['a missing request id', { type: 'predict', N: 12, cells: new Uint8Array(144) }, null, /requestId/],
    [
      'an unsupported grid',
      { type: 'predict', requestId: 5, N: 20, cells: new Uint8Array(400) },
      5,
      /unsupported grid/,
    ],
    [
      'cells of the wrong size',
      { type: 'predict', requestId: 6, N: 12, cells: new Uint8Array(10) },
      6,
      /144/,
    ],
    [
      'cells that are not 0/1',
      { type: 'predict', requestId: 8, N: 12, cells: new Uint8Array(144).fill(3) },
      8,
      /0\/1/,
    ],
    [
      'a seed pixel set to air',
      { type: 'predict', requestId: 9, N: 12, cells: new Uint8Array(144) },
      9,
      /seed pixel/,
    ],
  ])('rejects %s with an error message', async (_label, message, requestId, text) => {
    const { server, calls, posted } = setup();
    await tick();
    server.handle(message);
    await tick();
    const error = posted.find((p) => p.message.type === 'error')?.message;
    expect(error).toMatchObject({ type: 'error', requestId, phase: 'predict' });
    expect(error?.type === 'error' ? error.message : '').toMatch(text);
    expect(calls).toHaveLength(0);
  });
});
