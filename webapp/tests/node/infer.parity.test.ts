// @vitest-environment node
/**
 * C4.3 parity (parity-check skill: TypeScript + onnxruntime-web vs fixture dB, <= 1e-4 dB).
 * Full browser pipeline in Node: fixture pattern -> TS grid -> TS graph builder -> onnxruntime-web
 * (wasm, one thread) -> de-normalised dB, compared with the float64 Python reference in the fixture.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../../src/core/graph';
import { create } from '../../src/core/grid';
import { loadModel, NUM_FREQ, predict, type ModelSession } from '../../src/core/infer';
import { parseMeta, type ModelMeta } from '../../src/model/meta';

const TOLERANCE_DB = 1e-4;
const root = (relative: string) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));

interface FixtureCase {
  id: string;
  N: number;
  pattern: number[];
  expected_db: number[];
  expected_z: number[];
}

const meta: ModelMeta = parseMeta(JSON.parse(readFileSync(root('public/model/meta.json'), 'utf8')));
const cases: FixtureCase[] = readdirSync(root('fixtures'))
  .filter((name) => name.endsWith('.json'))
  .flatMap(
    (name) => (JSON.parse(readFileSync(root(`fixtures/${name}`), 'utf8')) as { cases: FixtureCase[] }).cases,
  )
  .sort((a, b) => a.N - b.N);

let session: ModelSession;
const worst: { id: string; err: number }[] = [];

beforeAll(async () => {
  session = await loadModel(readFileSync(root('public/model/antenna_gnn.onnx')));
});

afterAll(async () => {
  worst.sort((a, b) => b.err - a.err);
  console.log(
    `onnxruntime-web parity over ${String(worst.length)} cases: max |dB error| ${worst[0]?.err.toExponential(3) ?? 'n/a'}; ` +
      `worst ${worst
        .slice(0, 3)
        .map((w) => `${w.id} ${w.err.toExponential(2)}`)
        .join(', ')}`,
  );
  await session.release();
});

describe('loadModel', () => {
  it('exposes the exported interface', () => {
    expect(session.inputNames).toEqual(['x', 'edge_index', 'edge_attr']);
    expect(session.outputNames).toEqual(['z']);
  });
});

describe('predict parity with the float64 reference', () => {
  it('covers all five grids', () => {
    expect([...new Set(cases.map((c) => c.N))]).toEqual([12, 15, 25, 35, 45]);
  });

  it.each(cases.map((c) => [c.id, c] as const))(
    '%s: max |dB_ts - dB_fixture| <= 1e-4',
    async (id, fixture) => {
      const grid = { ...create(fixture.N, meta), cells: Uint8Array.from(fixture.pattern) };
      const db = await predict(session, buildGraph(grid, meta), meta);
      expect(db).toBeInstanceOf(Float64Array);
      expect(db).toHaveLength(NUM_FREQ);
      let err = 0;
      for (let k = 0; k < NUM_FREQ; k++)
        err = Math.max(err, Math.abs((db[k] ?? Number.NaN) - (fixture.expected_db[k] ?? 0)));
      worst.push({ id, err });
      expect(err).toBeLessThanOrEqual(TOLERANCE_DB);
    },
  );
});

describe('predict input checks', () => {
  it('rejects a graph whose arrays do not match its counts', async () => {
    const grid = create(12, meta);
    const graph = buildGraph(grid, meta);
    await expect(predict(session, { ...graph, numEdges: graph.numEdges + 1 }, meta)).rejects.toThrow(
      RangeError,
    );
  });
});
