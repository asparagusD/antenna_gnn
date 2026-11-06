/**
 * Inference benchmark (C4.3): median time per grid for buildGraph and for predict (onnxruntime-web,
 * wasm, one thread) in Node. Run: npm run bench:infer. Reports only; optimisation comes later.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { buildGraph } from '../src/core/graph';
import { create, type Grid } from '../src/core/grid';
import { loadModel, predict } from '../src/core/infer';
import { parseMeta } from '../src/model/meta';

const WARMUP = 5;
const RUNS = 40;
const root = (relative: string) => fileURLToPath(new URL(`../${relative}`, import.meta.url));

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? NaN) : ((sorted[mid - 1] ?? NaN) + (sorted[mid] ?? NaN)) / 2;
}

it('median inference time per grid', async () => {
  const meta = parseMeta(JSON.parse(readFileSync(root('public/model/meta.json'), 'utf8')));
  const session = await loadModel(readFileSync(root('public/model/antenna_gnn.onnx')));
  const rows: string[] = [];
  for (const name of readdirSync(root('fixtures')).filter((n) => n.endsWith('.json'))) {
    const file = JSON.parse(readFileSync(root(`fixtures/${name}`), 'utf8')) as {
      N: number;
      cases: { pattern: number[] }[];
    };
    const grids: Grid[] = file.cases.map((c) => ({
      ...create(file.N, meta),
      cells: Uint8Array.from(c.pattern),
    }));
    const build: number[] = [];
    const infer: number[] = [];
    for (let i = 0; i < WARMUP + RUNS; i++) {
      const grid = grids[i % grids.length] as Grid;
      const t0 = performance.now();
      const graph = buildGraph(grid, meta);
      const t1 = performance.now();
      await predict(session, graph, meta);
      const t2 = performance.now();
      if (i >= WARMUP) {
        build.push(t1 - t0);
        infer.push(t2 - t1);
      }
    }
    rows.push(
      `${String(file.N).padStart(2)}x${String(file.N).padEnd(2)}  nodes ${String(file.N * file.N + 1).padStart(4)}  ` +
        `buildGraph ${median(build).toFixed(2).padStart(6)} ms  predict ${median(infer).toFixed(2).padStart(7)} ms  ` +
        `total ${(median(build) + median(infer)).toFixed(2).padStart(7)} ms`,
    );
  }
  await session.release();
  console.log(
    `\nInference benchmark (Node ${process.version}, onnxruntime-web wasm, 1 thread, ${cpus()[0]?.model.trim() ?? 'cpu'}; ` +
      `median of ${String(RUNS)} runs after ${String(WARMUP)} warm-up)\n${rows.join('\n')}`,
  );
  expect(rows).toHaveLength(5);
});
