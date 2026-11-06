/**
 * Inference with onnxruntime-web (C4.3).
 *
 * The model is webapp/public/model/antenna_gnn.onnx: inputs x [num_nodes, 6] float32,
 * edge_index [2, num_edges] int64, edge_attr [num_edges, 2] float32; output z [1, 201] float32
 * (z-scored |S11|). predict() de-normalises in float64 with the exact float32 statistics from
 * meta.json: dB = z * s11_std + s11_mean, as the Python reference does.
 *
 * Backend: wasm, one thread. GitHub Pages cannot send the COOP/COEP headers that SharedArrayBuffer
 * (and so multi-threaded wasm) needs, and the proxy worker is off because the app runs inference
 * in its own Web Worker (C4.4).
 */
// The wasm-only entry: the default entry bundles the JSEP build (WebGPU/WebNN, 29.5 MB of wasm), which
// this CPU-only, single-thread app never uses (C6.2 audit).
import * as ort from 'onnxruntime-web/wasm';
import type { ModelMeta } from '../model/meta';
import type { Graph } from './graph';
import { NUM_FEATURES } from './graph';

export const NUM_FREQ = 201;
export type ModelSession = ort.InferenceSession;
export type StatsSpec = Pick<ModelMeta, 's11_mean' | 's11_std'>;

export interface LoadOptions {
  /** Where onnxruntime-web fetches its .wasm files from (default: next to its own module). */
  wasmPaths?: string;
}

/** Creates an inference session from a model URL (browser) or the model bytes (browser or Node). */
export async function loadModel(
  source: string | Uint8Array,
  options: LoadOptions = {},
): Promise<ModelSession> {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  if (options.wasmPaths !== undefined) ort.env.wasm.wasmPaths = options.wasmPaths;
  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    // Errors only: onnxruntime logs harmless VerifyOutputSizes warnings for an intermediate tensor
    // whose exported shape annotation is {-1} (see DEBUG_LOG.md, C2.1); outputs are unaffected.
    logSeverityLevel: 3,
  };
  return typeof source === 'string'
    ? ort.InferenceSession.create(source, sessionOptions)
    : ort.InferenceSession.create(source, sessionOptions);
}

function checkGraph(graph: Graph): void {
  const { numNodes, numEdges, x, edgeIndex, edgeAttr } = graph;
  if (
    !Number.isInteger(numNodes) ||
    !Number.isInteger(numEdges) ||
    numNodes < 2 ||
    numEdges < 0 ||
    x.length !== numNodes * NUM_FEATURES ||
    edgeIndex.length !== 2 * numEdges ||
    edgeAttr.length !== 2 * numEdges
  ) {
    throw new RangeError(
      `graph arrays do not match its counts (nodes ${String(numNodes)}, edges ${String(numEdges)}, ` +
        `x ${String(x.length)}, edgeIndex ${String(edgeIndex.length)}, edgeAttr ${String(edgeAttr.length)})`,
    );
  }
}

/** Raw model output z (201 float32 values) for one graph. */
export async function predictZ(session: ModelSession, graph: Graph): Promise<Float32Array> {
  checkGraph(graph);
  const feeds = {
    x: new ort.Tensor('float32', graph.x, [graph.numNodes, NUM_FEATURES]),
    edge_index: new ort.Tensor('int64', graph.edgeIndex, [2, graph.numEdges]),
    edge_attr: new ort.Tensor('float32', graph.edgeAttr, [graph.numEdges, 2]),
  };
  const outputs = await session.run(feeds);
  const z = outputs.z;
  if (z === undefined) throw new Error('model returned no "z" output');
  try {
    if (z.type !== 'float32' || z.dims.length !== 2 || z.dims[0] !== 1 || z.dims[1] !== NUM_FREQ) {
      throw new Error(
        `unexpected model output ${z.type} [${z.dims.join(', ')}], expected float32 [1, ${String(NUM_FREQ)}]`,
      );
    }
    return Float32Array.from(z.data as Float32Array);
  } finally {
    z.dispose();
  }
}

/** |S11| in dB at the 201 frequencies of meta.freq_ghz, computed in float64. */
export async function predict(session: ModelSession, graph: Graph, stats: StatsSpec): Promise<Float64Array> {
  const z = await predictZ(session, graph);
  const db = new Float64Array(NUM_FREQ);
  for (let k = 0; k < NUM_FREQ; k++) {
    db[k] = (z[k] ?? Number.NaN) * (stats.s11_std[k] ?? Number.NaN) + (stats.s11_mean[k] ?? Number.NaN);
  }
  return db;
}
