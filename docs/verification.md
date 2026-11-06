# Final verification (C8)

Results of the Chunk 8 handover checks for GraphPatch, the client-side web app for the
`ch52_bal_ft45_s0` GATv2 surrogate. Machine: Windows 11 desktop (AMD Ryzen 5 5600X), Node 24.14.0,
Playwright 1.65.0 (Chromium). Date: 2026-11-06.

## C8.1 Full regression

All runs on branch `webapp` at `00d5f0c` plus the C8.1 change to `webapp/e2e-live/live.spec.ts`.
The live site was deployed from `main` at `52329bc`; the only commit after it on `webapp` (`00d5f0c`)
is docs-only, so the live build matches the current `webapp/` source.

| Check | Command | Result |
|---|---|---|
| Fast suite | `make check` | exit 0: typecheck, ESLint, Vitest **754/754**, Impeccable detector clean, pytest **267/267** |
| End-to-end (local production build) | `make e2e` | **52/52** passed (25.4 s) |
| Live site (GitHub Pages) | `cd webapp && npm run e2e:live` | **50/50** passed (1.6 min) |

### Parity on every golden fixture

The 48 golden fixtures (`webapp/fixtures/{12,15,25,35,45}x*.json`: 10 + 10 + 10 + 10 + 8 cases, reference
patterns from the data plus random patterns at 30–80% fill) hold the float64 Python reference output
(frozen `build_pyg_graph` + feed-component feature + PyTorch model, de-normalised to dB).
The parity contract is **max |dB − dB_reference| ≤ 1e-4 dB** over all 201 frequencies.

| Layer | Where it runs | Cases | Max error | Worst cases |
|---|---|---|---|---|
| TypeScript graph builder | Vitest (`src/core/graph.test.ts`) | 48 | exact (node features, edge list, edge attributes) | n/a |
| TS graph + onnxruntime-web (wasm) | Node, Vitest (`tests/node/infer.parity.test.ts`) | 48 | **2.16e-5 dB** | 35x35-rand-fill70 2.15e-5, 15x15-ref-sample_55 1.95e-5, 25x25-rand-fill80 1.87e-5 |
| Whole app (worker, ORT wasm, CSV export) | Deployed site in Chromium (`e2e-live/live.spec.ts`) | 48 | **2.2e-5 dB** | 35x35-rand-fill70 2.2e-5, 15x15-ref-sample_55 2.0e-5, 25x25-rand-fill80 1.9e-5 |

In the browser each case opens the deployed app on a share link holding the fixture pattern, waits for
the prediction, downloads the |S11| CSV and compares all 201 values with the reference. The CSV carries
six decimals, so browser differences are quantised to 1e-6 dB. Per-grid maximum on the live site:
12×12 1.0e-5, 15×15 2.0e-5, 25×25 1.9e-5, 35×35 2.2e-5, 45×45 1.4e-5 dB. The worst cases are the same in
Node and in the browser, as expected from the same wasm kernels.

C8.1 change: the live suite previously checked only the first fixture per grid (5 cases); it now runs
every fixture case (48), plus the asset/console test and the share-link round-trip.

Live asset check (same run): page, `meta.json`, `antenna_gnn.onnx` and the ORT `.wasm` all 200, no
`no-store`, wasm served as `application/wasm`, console clean, `crossOriginIsolated` false (not needed for
single-thread wasm).

## C8.2 Performance report

Machine: AMD Ryzen 5 5600X (6 cores / 12 threads), Windows 11, headless Chromium 158 (Playwright 1.65),
home broadband to GitHub Pages. All browser figures are for the live site,
https://asparagusd.github.io/antenna_gnn/. onnxruntime-web runs single-threaded wasm in a Web Worker.

### Download size

Bytes on the wire for one cold load (gzip as served by GitHub Pages), from
`node webapp/scripts/measure-startup.mjs --runs 5`:

| Asset | Uncompressed | Transferred (cold) |
|---|---|---|
| Model `model/antenna_gnn.onnx` | 2,590,161 B (2.47 MiB) | 2,268,579 B (2.16 MiB) |
| `model/meta.json` (normalisation stats, grids, seeds) | 38,956 B | 6.4 KiB |
| onnxruntime-web wasm (`ort-wasm-simd-threaded-*.wasm`) | 14,848,852 B (14.2 MiB) | 3,867,655 B (3.69 MiB) |
| App JS (React, app, onnxruntime-web JS) + worker stub | — | 83.5 KiB |
| CSS, HTML, font (Public Sans, latin subset) | — | 31.6 KiB |
| **Total, cold** | | **6,113.9 KiB (5.97 MiB)** |
| **Total, warm** (second visit within the cache lifetime) | | **0 B of response bodies** (all from the HTTP cache) |

The model itself is 2.16 MiB to download; the wasm runtime is the largest item. GitHub Pages sends
`Cache-Control: max-age=600` with an ETag, so after 10 minutes a repeat visit revalidates (304s) rather
than downloading again.

### Time to first prediction

From navigation start to the first frame after the first prediction reached the page (the first
`graphpatch:predict` User Timing measure): page load, worker start, wasm and model download and compile,
session creation, graph build, inference of the 25×25 example antenna, first render. Five runs, each in a
fresh browser context (cold, empty cache) followed by a second page in the same context (warm).

| Load | Median | Min | Max |
|---|---|---|---|
| Cold (empty cache) | **1,330 ms** | 1,169 ms | 1,759 ms |
| Warm (HTTP cache) | **530 ms** | 515 ms | 547 ms |

A first run on this machine, before these five, took 2,528 ms cold (DNS and TLS set-up included). Warm
loads still spend about half a second compiling the 14 MiB wasm and creating the ONNX session; the cold
figure depends on the network and will be slower on a slower connection.

### Inference time per grid

Browser (live site): `node webapp/scripts/measure-latency.mjs https://asparagusd.github.io/antenna_gnn/ --clicks 40`;
each sample is one single-pixel edit. "Worker inference" is graph build + onnxruntime inside the worker;
"perceived" adds messaging, the React commit and the next animation frame.

Node: `cd webapp && npm run bench:infer` (same TypeScript graph builder and onnxruntime-web wasm, one
thread, median of 40 runs after 5 warm-up).

| Grid | Nodes | Browser worker inference (median) | Browser perceived (median / p90) | Node build + predict (median) |
|---|---|---|---|---|
| 12×12 | 145 | 14.1 ms | 30.5 / 31.4 ms | 13.4 ms |
| 15×15 | 226 | 21.4 ms | 30.7 / 31.6 ms | 20.1 ms |
| 25×25 | 626 | 59.3 ms | 64.1 / 64.9 ms | 53.8 ms |
| 35×35 | 1,226 | 119.6 ms | 130.2 / 131.2 ms | 112.0 ms |
| 45×45 | 2,026 | 224.5 ms | 230.3 / 246.8 ms | 199.5 ms |

The graph build is under 1 ms on every grid (Node: 0.09–0.64 ms), so inference dominates and grows
roughly linearly with the node count. On 12×12 and 15×15 the perceived time is set by frame alignment
(about two 60 Hz frames), not by inference. No mid-range laptop or phone was measured.
