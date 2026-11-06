/**
 * Inference Web Worker (C4.4): graph building and onnxruntime-web run here, off the main thread,
 * so painting stays smooth. All logic lives in predictServer.ts; this file only wires it to the
 * worker global. The main thread creates it with
 *   new Worker(new URL('./core/worker.ts', import.meta.url), { type: 'module' })
 * and talks to it with the protocol documented in predictServer.ts.
 */
import { loadMeta } from '../model/meta';
import { loadModel } from './infer';
import { createPredictServer } from './predictServer';

/** The slice of DedicatedWorkerGlobalScope this file uses (the app's tsconfig has DOM, not WebWorker, types). */
interface WorkerScope {
  postMessage: (message: unknown, transfer: Transferable[]) => void;
  onmessage: ((event: MessageEvent) => void) | null;
}

const scope = self as unknown as WorkerScope;
const base = import.meta.env.BASE_URL;

const server = createPredictServer({
  init: async () => {
    const meta = await loadMeta(base);
    const session = await loadModel(`${base.endsWith('/') ? base : `${base}/`}model/${meta.onnx.file}`);
    return { session, meta };
  },
  post: (message, transfer) => {
    scope.postMessage(message, transfer);
  },
});

scope.onmessage = (event) => {
  server.handle(event.data);
};
