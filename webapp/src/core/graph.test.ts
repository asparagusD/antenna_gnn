/**
 * C4.2 parity: the TypeScript graph builder reproduces the golden fixtures EXACTLY (parity-check skill:
 * TypeScript graph builder vs fixture x / edges / edge_attr, exact float32). The fixtures were written by
 * the frozen Python build_pyg_graph + AppendFeedComponentFeature (export/scripts/make_fixtures.py).
 */
import { describe, expect, it } from 'vitest';
import committedMeta from '../../public/model/meta.json';
import { parseMeta } from '../model/meta';
import { buildGraph, feedComponent, NUM_FEATURES, type GraphSpec } from './graph';
import { create, paint, type Grid } from './grid';

interface FixtureCase {
  id: string;
  N: number;
  pattern: number[];
  num_nodes: number;
  num_edges: number;
  x: number[];
  edge_index: [number[], number[]];
  edge_attr: [number, number][];
}

interface FixtureFile {
  N: number;
  cases: FixtureCase[];
}

const meta: GraphSpec = parseMeta(structuredClone(committedMeta));
const files = import.meta.glob<FixtureFile>('../../fixtures/*.json', { eager: true, import: 'default' });
const cases = Object.values(files)
  .sort((a, b) => a.N - b.N)
  .flatMap((file) => file.cases);

function gridFor(fixture: FixtureCase): Grid {
  const base = create(fixture.N, meta);
  return { ...base, cells: Uint8Array.from(fixture.pattern) };
}

const FEATURE_NAMES = ['metal', 'x_norm', 'y_norm', 'is_seed', 'dist', 'feed_component'];

/** Graph-builder playbook: name the first differing value by node, feature and pixel (row, col). */
function firstXDifference(N: number, actual: Float32Array, expected: Float32Array): string | null {
  const n = Math.max(actual.length, expected.length);
  for (let k = 0; k < n; k++) {
    if (!Object.is(actual[k], expected[k])) {
      const node = Math.floor(k / NUM_FEATURES);
      const where = node === N * N ? 'virtual node' : `pixel (row ${Math.floor(node / N)}, col ${node % N})`;
      const feature = FEATURE_NAMES[k % NUM_FEATURES] ?? '?';
      return `x[${node}, ${k % NUM_FEATURES}] (${feature}) at ${where}: got ${String(actual[k])}, expected ${String(expected[k])}`;
    }
  }
  return null;
}

type Edge = [number, number, number, number]; // src, dst, type, direction

function edges(index: ArrayLike<bigint | number>, attr: ArrayLike<number>, count: number): Edge[] {
  const out: Edge[] = [];
  for (let e = 0; e < count; e++) {
    out.push([Number(index[e]), Number(index[count + e]), Number(attr[2 * e]), Number(attr[2 * e + 1])]);
  }
  return out;
}

function sortEdges(list: Edge[]): Edge[] {
  return [...list].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function describeEdge(N: number, [src, dst, type, dir]: Edge): string {
  const at = (node: number) =>
    node === N * N ? 'virtual' : `(row ${Math.floor(node / N)}, col ${node % N})`;
  return `${String(src)} ${at(src)} -> ${String(dst)} ${at(dst)} [type ${String(type)}, dir ${String(dir)}]`;
}

function firstEdgeDifference(N: number, actual: Edge[], expected: Edge[]): string | null {
  const n = Math.max(actual.length, expected.length);
  for (let e = 0; e < n; e++) {
    const a = actual[e];
    const b = expected[e];
    if (a === undefined || b === undefined || a.some((v, i) => v !== b[i])) {
      return `edge ${String(e)}: got ${a ? describeEdge(N, a) : 'none'}, expected ${b ? describeEdge(N, b) : 'none'}`;
    }
  }
  return null;
}

describe('fixture set', () => {
  it('has cases for all five grids', () => {
    expect([...new Set(cases.map((c) => c.N))]).toEqual([12, 15, 25, 35, 45]);
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });
});

describe.each(cases.map((c) => [c.id, c] as const))('%s', (_id, fixture) => {
  const { N } = fixture;
  const graph = buildGraph(gridFor(fixture), meta);
  const expectedX = Float32Array.from(fixture.x);
  const expectedEdges = edges(
    [...fixture.edge_index[0], ...fixture.edge_index[1]],
    fixture.edge_attr.flat(),
    fixture.num_edges,
  );
  const actualEdges = edges(graph.edgeIndex, graph.edgeAttr, graph.numEdges);

  it('has the same node and edge counts and array types', () => {
    expect(graph.numNodes).toBe(fixture.num_nodes);
    expect(graph.numNodes).toBe(N * N + 1);
    expect(graph.numEdges).toBe(fixture.num_edges);
    expect(graph.x).toBeInstanceOf(Float32Array);
    expect(graph.edgeIndex).toBeInstanceOf(BigInt64Array);
    expect(graph.edgeAttr).toBeInstanceOf(Float32Array);
    expect(graph.x).toHaveLength(graph.numNodes * NUM_FEATURES);
    expect(graph.edgeIndex).toHaveLength(2 * graph.numEdges);
    expect(graph.edgeAttr).toHaveLength(2 * graph.numEdges);
  });

  it('x equals the fixture exactly (float32)', () => {
    expect(firstXDifference(N, graph.x, expectedX)).toBeNull();
  });

  it('edges and edge_attr equal the fixture as sorted sets', () => {
    expect(firstEdgeDifference(N, sortEdges(actualEdges), sortEdges(expectedEdges))).toBeNull();
  });

  it('edges come in the same order as the frozen builder', () => {
    expect(firstEdgeDifference(N, actualEdges, expectedEdges)).toBeNull();
  });
});

describe('feed component (8-connected)', () => {
  it('at 25×25 with seeds only, the feed pixel stands alone (one-pixel gap above the seed block)', () => {
    const grid = create(25, meta);
    const component = feedComponent(grid, meta);
    expect(component.reduce((s, v) => s + v, 0)).toBe(1);
    expect(component[5 * 25 + 12]).toBe(1);
  });

  it('a diagonal chain joins the feed to the seed block (corners conduct)', () => {
    let grid = create(25, meta);
    grid = paint(grid, 6, 13, 1);
    grid = paint(grid, 7, 14, 1);
    const component = feedComponent(grid, meta);
    expect(component.reduce((s, v) => s + v, 0)).toBe(1 + 2 + 64);
  });

  it('is empty when the feed pixel is air (only reachable by bypassing the seed lock)', () => {
    const base = create(12, meta);
    const cells = base.cells.slice();
    cells[2 * 12 + 5] = 0;
    expect(feedComponent({ ...base, cells }, meta).every((v) => v === 0)).toBe(true);
  });

  it('marks the virtual node 0 in the graph', () => {
    const graph = buildGraph(create(12, meta), meta);
    expect(Array.from(graph.x.subarray(144 * NUM_FEATURES))).toEqual([0, 0.5, 0.5, -1, 0, 0]);
  });
});
