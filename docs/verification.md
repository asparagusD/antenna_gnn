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
