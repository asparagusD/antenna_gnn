import { describe, expect, it } from 'vitest';
import { createPredictClient, type ClientEvent, type WorkerLike } from './predictClient';
import type { WorkerRequest, WorkerResponse } from './predictServer';

class FakeWorker implements WorkerLike {
  sent: WorkerRequest[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage(message: unknown): void {
    this.sent.push(message as WorkerRequest);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(message: WorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  let t = 0;
  const client = createPredictClient({
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    now: () => t,
  });
  const events: ClientEvent[] = [];
  client.subscribe((event) => events.push(event));
  const grid = (v: number) => ({ N: 12, cells: new Uint8Array(144).fill(v) });
  return {
    client,
    events,
    grid,
    worker: () => workers.at(-1) as FakeWorker,
    workers,
    tick: (ms: number) => {
      t += ms;
    },
  };
}

const curve = (v: number) => new Float64Array(201).fill(v);

describe('predictClient', () => {
  it('sends predict requests with increasing ids and a copy of the cells', () => {
    const { client, grid, worker } = setup();
    const g = grid(1);
    const a = client.request(g);
    const b = client.request(grid(0));
    expect(b).toBeGreaterThan(a);
    expect(worker().sent.map((m) => m.requestId)).toEqual([a, b]);
    const first = worker().sent[0];
    expect(first?.N).toBe(12);
    expect(first?.cells).not.toBe(g.cells); // transferred copy, the grid stays intact
    expect(Array.from(first?.cells ?? [])).toEqual(Array.from(g.cells));
  });

  it('reports ready, then the latest result with its latency', () => {
    const { client, events, grid, worker, tick } = setup();
    worker().reply({ type: 'ready', loadMs: 500 });
    const id = client.request(grid(1));
    tick(42);
    worker().reply({ type: 'result', requestId: id, s11: curve(-12), ms: 30 });
    expect(events[0]).toEqual({ type: 'ready', loadMs: 500 });
    expect(events[1]).toMatchObject({ type: 'result', requestId: id, latencyMs: 42, inferMs: 30 });
    expect(client.pending()).toBe(false);
  });

  it('ignores results older than the latest request and stays pending until the latest arrives', () => {
    const { client, events, grid, worker } = setup();
    const a = client.request(grid(1));
    const b = client.request(grid(0));
    expect(client.pending()).toBe(true);
    worker().reply({ type: 'result', requestId: a, s11: curve(-5), ms: 10 });
    worker().reply({ type: 'dropped', requestId: a, supersededBy: b });
    expect(events).toEqual([]);
    expect(client.pending()).toBe(true);
    worker().reply({ type: 'result', requestId: b, s11: curve(-7), ms: 10 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'result', requestId: b });
    expect(client.pending()).toBe(false);
  });

  it('reports an error for the latest request or for model loading, not for stale ones', () => {
    const { client, events, grid, worker } = setup();
    const a = client.request(grid(1));
    client.request(grid(0));
    worker().reply({ type: 'error', requestId: a, phase: 'predict', message: 'old' });
    expect(events).toEqual([]);
    worker().reply({ type: 'error', requestId: null, phase: 'init', message: 'no model' });
    expect(events).toEqual([{ type: 'error', phase: 'init', message: 'no model' }]);
  });

  it('a worker crash is reported as a model error', () => {
    const { events, worker } = setup();
    worker().onerror?.({ message: 'boom' } as ErrorEvent);
    expect(events).toEqual([{ type: 'error', phase: 'init', message: 'boom' }]);
  });

  it('retry after a model error starts a new worker and resends the latest grid', () => {
    const { client, grid, worker, workers } = setup();
    client.request(grid(1));
    worker().reply({ type: 'error', requestId: null, phase: 'init', message: 'no model' });
    client.retry();
    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminated).toBe(true);
    expect(worker().sent).toHaveLength(1);
    expect(worker().sent[0]?.N).toBe(12);
  });

  it('retry after a prediction error resends the latest grid on the same worker', () => {
    const { client, grid, worker, workers } = setup();
    const id = client.request(grid(1));
    worker().reply({ type: 'error', requestId: id, phase: 'predict', message: 'bad' });
    client.retry();
    expect(workers).toHaveLength(1);
    expect(worker().sent).toHaveLength(2);
  });

  it('dispose terminates the worker and stops events', () => {
    const { client, events, grid, worker } = setup();
    const id = client.request(grid(1));
    client.dispose();
    expect(worker().terminated).toBe(true);
    worker().reply({ type: 'result', requestId: id, s11: curve(-5), ms: 1 });
    expect(events).toEqual([]);
  });
});
