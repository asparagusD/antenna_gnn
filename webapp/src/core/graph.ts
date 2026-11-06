/**
 * TypeScript port of the frozen graph builder (C4.2).
 *
 * Mirrors, line for line, `build_pyg_graph` from the frozen Chunk 5/12 builder
 * (export/antenna_export/graph_builder.py) followed by `AppendFeedComponentFeature` from
 * src/feed_component.py, so the browser feeds the model exactly the graph it was trained on:
 *
 * - Nodes: pixel (i, j) is node i*N + j; one virtual node at index N*N.
 * - Features (6, float32): [metal, j/(N-1), i/(N-1), is_seed, dist/N, feed_component], where dist
 *   is the Euclidean distance from (i, j) to the mean (row, col) of the seed pixels; the virtual
 *   node is [0, 0.5, 0.5, -1, 0, 0].
 * - Pixel edges: for each pixel in row-major order, neighbours right (dir 0), left (1), up (2),
 *   down (3) when inside the grid; edge_attr [type, dir] with type from (source metal, target
 *   metal): (1,1)->0, (1,0)->1, (0,1)->2, (0,0)->3.
 * - Virtual edges, appended after all pixel edges: for each metal pixel in row-major order,
 *   virtual->pixel then pixel->virtual, both [4, 4].
 *
 * Every value is computed in float64 exactly as numpy/Python do and then rounded to float32 once,
 * as torch.tensor(..., dtype=torch.float) does. Parity with the golden fixtures is exact
 * (src/core/graph.test.ts).
 */
import type { ModelMeta } from '../model/meta';
import type { Grid } from './grid';

export const NUM_FEATURES = 6;
export const VIRTUAL_EDGE_TYPE = 4;

/** The part of meta.json the builder needs. */
export type GraphSpec = Pick<ModelMeta, 'grids' | 'seed_masks' | 'feed_rc'>;

export interface Graph {
  numNodes: number;
  numEdges: number;
  /** numNodes x 6, row-major. */
  x: Float32Array;
  /** 2 x numEdges, row-major: sources (row 0) then targets (row 1), int64 as the model expects. */
  edgeIndex: BigInt64Array;
  /** numEdges x 2, row-major: [type, direction]. */
  edgeAttr: Float32Array;
}

// (di, dj, direction) in the frozen builder's order: right, left, up, down.
const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [0, -1, 1],
  [-1, 0, 2],
  [1, 0, 3],
];

// etype_map = {(1,1): 0, (1,0): 1, (0,1): 2, (0,0): 3}, indexed [source metal][target metal].
const EDGE_TYPE: readonly (readonly number[])[] = [
  [3, 2],
  [1, 0],
];

function feedPixel(N: number, spec: GraphSpec): readonly [number, number] {
  const feed = spec.feed_rc[String(N)];
  if (feed === undefined) throw new RangeError(`meta.json has no feed pixel for ${N}×${N}`);
  return feed;
}

/**
 * 1 for pixels in the 8-connected metal component containing the feed pixel, else 0
 * (src/feed_component.feed_component_mask; all zero when the feed pixel is air).
 */
export function feedComponent(grid: Grid, spec: GraphSpec): Uint8Array {
  const { N, cells } = grid;
  const [fr, fc] = feedPixel(N, spec);
  const mask = new Uint8Array(N * N);
  const start = fr * N + fc;
  if (cells[start] !== 1) return mask;
  const stack = [start];
  mask[start] = 1;
  while (stack.length > 0) {
    const k = stack.pop() as number;
    const i = Math.floor(k / N);
    const j = k - i * N;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = ni * N + nj;
        if (cells[nk] === 1 && mask[nk] === 0) {
          mask[nk] = 1;
          stack.push(nk);
        }
      }
    }
  }
  return mask;
}

/** The 6-feature graph for `grid`, identical to the frozen Python builder's output. */
export function buildGraph(grid: Grid, spec: GraphSpec): Graph {
  const { N, cells, seed } = grid;
  const numPixels = N * N;
  if (cells.length !== numPixels || seed.length !== numPixels) {
    throw new RangeError(`grid arrays must have ${numPixels} values`);
  }

  // seed_r, seed_c = np.argwhere(seed_mask).mean(axis=0): integer sums are exact in float64.
  let sumR = 0;
  let sumC = 0;
  let count = 0;
  for (let k = 0; k < numPixels; k++) {
    if (seed[k] === 1) {
      sumR += Math.floor(k / N);
      sumC += k % N;
      count += 1;
    }
  }
  if (count === 0) throw new RangeError(`the ${N}×${N} seed mask is empty`);
  const seedR = sumR / count;
  const seedC = sumC / count;

  const numNodes = numPixels + 1;
  const x = new Float32Array(numNodes * NUM_FEATURES);
  const feed = feedComponent(grid, spec);
  let metalCount = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const k = i * N + j;
      const metal = cells[k] === 1 ? 1 : 0;
      metalCount += metal;
      const dr = i - seedR;
      const dc = j - seedC;
      const o = k * NUM_FEATURES;
      x[o] = metal;
      x[o + 1] = j / (N - 1);
      x[o + 2] = i / (N - 1);
      x[o + 3] = seed[k] === 1 ? 1 : 0;
      x[o + 4] = Math.sqrt(dr * dr + dc * dc) / N;
      x[o + 5] = feed[k] ?? 0;
    }
  }
  const v = numPixels * NUM_FEATURES;
  x[v] = 0;
  x[v + 1] = 0.5;
  x[v + 2] = 0.5;
  x[v + 3] = -1;
  x[v + 4] = 0;
  x[v + 5] = 0;

  const numEdges = 4 * N * (N - 1) + 2 * metalCount;
  const edgeIndex = new BigInt64Array(2 * numEdges);
  const edgeAttr = new Float32Array(2 * numEdges);
  let e = 0;
  const push = (src: number, dst: number, type: number, direction: number) => {
    edgeIndex[e] = BigInt(src);
    edgeIndex[numEdges + e] = BigInt(dst);
    edgeAttr[2 * e] = type;
    edgeAttr[2 * e + 1] = direction;
    e += 1;
  };

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const idx = i * N + j;
      const mIJ = cells[idx] === 1 ? 1 : 0;
      for (const [di, dj, direction] of NEIGHBOURS) {
        const ni = i + di;
        const nj = j + dj;
        if (ni >= 0 && ni < N && nj >= 0 && nj < N) {
          const nidx = ni * N + nj;
          const mNb = cells[nidx] === 1 ? 1 : 0;
          push(idx, nidx, EDGE_TYPE[mIJ]?.[mNb] ?? 3, direction);
        }
      }
    }
  }

  const globalIdx = numPixels;
  for (let idx = 0; idx < numPixels; idx++) {
    if (cells[idx] === 1) {
      push(globalIdx, idx, VIRTUAL_EDGE_TYPE, VIRTUAL_EDGE_TYPE);
      push(idx, globalIdx, VIRTUAL_EDGE_TYPE, VIRTUAL_EDGE_TYPE);
    }
  }
  if (e !== numEdges) throw new Error(`internal error: wrote ${e} edges, expected ${numEdges}`);

  return { numNodes, numEdges, x, edgeIndex, edgeAttr };
}
