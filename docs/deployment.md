# Deployment: GitHub Pages

GraphPatch is a static site served from GitHub Pages at **https://asparagusd.github.io/antenna_gnn/**.
Workflow: `.github/workflows/deploy-webapp.yml` (C7.1). Live checks: `webapp/e2e-live/live.spec.ts` (C7.2).

## How a deployment happens

1. One-time repository setting: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge `webapp` into `main`. A push to `main` that touches `webapp/**` (or the workflow) starts the workflow;
   it can also be started by hand (Actions → "Deploy web app to GitHub Pages" → Run workflow).
3. The build job runs `make check-web` (typecheck, lint, Vitest including the ONNX parity tests against the
   committed fixtures, the Impeccable detector), builds with `BASE_PATH=/antenna_gnn/`, checks that
   `dist/model/antenna_gnn.onnx`, `dist/model/meta.json` and the onnxruntime `.wasm` are present, and uploads
   `webapp/dist`. The deploy job publishes it with `actions/deploy-pages`.
4. Run the live checks (below) against the published site.

## Live checks

From `webapp/`:

```bash
npm run e2e:live
```

`LIVE_URL` points the same tests at any copy of the site (it must end with `/`), for example a local
production preview:

```bash
MSYS_NO_PATHCONV=1 BASE_PATH=/antenna_gnn/ npm run build
MSYS_NO_PATHCONV=1 BASE_PATH=/antenna_gnn/ npx vite preview --port 4173
MSYS_NO_PATHCONV=1 LIVE_URL=http://localhost:4173/antenna_gnn/ npm run e2e:live
```

(`MSYS_NO_PATHCONV=1` only matters in Git Bash on Windows, which would otherwise rewrite `/antenna_gnn/`.)

What they check, in a real Chromium:

| Check | How |
|---|---|
| Page and model load | heading visible; top bar reaches "Model ready · runs in your browser"; the chart settles |
| Console clean | no console errors or warnings and no page errors during any test |
| Assets | `index.html`, `model/meta.json`, `model/antenna_gnn.onnx` and the onnxruntime `.wasm` return 200; nothing sends `Cache-Control: no-store`; the wasm is `application/wasm` (needed for streaming compilation); headers are printed for this record |
| No cross-origin isolation needed | `window.crossOriginIsolated` is reported; inference must work without COOP/COEP (single-thread wasm) |
| Parity in the browser | for each grid (12, 15, 25, 35, 45) the first golden fixture pattern is opened as a share link; the downloaded \|S11\| CSV (6 decimals) must be within **1e-4 dB** of the fixture's `expected_db` at all 201 frequencies |
| Share link round-trips | a random antenna's URL opened in a fresh browser context restores the same pixel count, the same hash and the same Depth |

The production build has no test hook (it exists only in the e2e build, C5.4), so parity goes through the
public path: share link in, CSV out.

## Results

### Local production preview, base `/antenna_gnn/` (2026-11-06)

`LIVE_URL=http://localhost:4173/antenna_gnn/`, `vite preview` of a plain production build: **7 passed**.

| Fixture | max \|browser − reference\| (dB) |
|---|---|
| 12x12-ref-sample_0 | 5.0e-6 |
| 15x15-ref-sample_0 | 1.0e-5 |
| 25x25-ref-sample_1534 | 2.0e-6 |
| 35x35-ref-sample_5 | 2.0e-6 |
| 45x45-ref-sample_1 | 4.0e-6 |

The CSV rounds dB to 6 decimals, so up to 5e-7 of each figure is rounding.

| Asset | Status | Content-Type | Cache-Control | ETag |
|---|---|---|---|---|
| `/antenna_gnn/` | 200 | text/html | no-cache | weak |
| `model/meta.json` | 200 | application/json | no-cache | weak (gzip) |
| `model/antenna_gnn.onnx` | 200 | (none from vite preview) | no-cache | weak (gzip) |
| `assets/ort-wasm-simd-threaded-*.wasm` | 200 | application/wasm | no-cache | weak |

`crossOriginIsolated`: **false**, and inference worked: no COOP/COEP headers are needed. Console: clean.
These headers are vite preview's, not GitHub Pages'; the Pages headers are recorded below.

### GitHub Pages, https://asparagusd.github.io/antenna_gnn/ (2026-11-06)

Deployed by the workflow run for merge commit `52329bc` (Node 24 action releases, `8f80fa1`). The first run
(`cff2ca0`) failed in `actions/configure-pages` with "Get Pages site failed … Not Found" because the Pages source
was not yet set to GitHub Actions; after the setting was changed, the next run succeeded.

`npm run e2e:live` (default `LIVE_URL`): **7 passed** (20.8 s). Console clean in every test.

| Fixture | max \|browser − reference\| (dB) |
|---|---|
| 12x12-ref-sample_0 | 5.0e-6 |
| 15x15-ref-sample_0 | 1.0e-5 |
| 25x25-ref-sample_1534 | 2.0e-6 |
| 35x35-ref-sample_5 | 2.0e-6 |
| 45x45-ref-sample_1 | 4.0e-6 |

Identical to the local preview: the deployed model and wasm are the tested ones.

| Asset | Status | Content-Type | Cache-Control | ETag | Encoding |
|---|---|---|---|---|---|
| `/antenna_gnn/` | 200 | text/html; charset=utf-8 | max-age=600 | weak | gzip |
| `model/meta.json` | 200 | application/json; charset=utf-8 | max-age=600 | weak | gzip |
| `model/antenna_gnn.onnx` | 200 | application/octet-stream | max-age=600 | weak | gzip |
| `assets/ort-wasm-simd-threaded-*.wasm` | 200 | application/wasm | max-age=600 | weak | gzip |

`crossOriginIsolated`: **false**, inference works: no COOP/COEP needed, as designed. Share link round-trip in a
fresh browser context: passed. Viewed in a browser: the 25×25 example antenna opens with "Model ready · runs
in your browser", Functioning Yes, 3.850 GHz, −21.4 dB.

Caching assessment: GitHub Pages sends `max-age=600` with an ETag for every file, so repeat visits revalidate
cheaply and files are at most 10 minutes stale after a deploy. The hashed `assets/*` names change with every
build; `model/antenna_gnn.onnx` and `meta.json` keep fixed names, so after a model update a returning visitor may
use the old pair for up to 10 minutes (they are deployed together, so they stay consistent with each other).
Sensible for this app; no change needed.

## Deployment playbook (what to check when something breaks)

| Area | Expectation in this app | Status |
|---|---|---|
| Base path | Vite `base` comes from `BASE_PATH` (`/antenna_gnn/` in CI). meta.json and the model are fetched through `import.meta.env.BASE_URL` (`model/meta.ts`, `core/worker.ts`); the onnxruntime wasm is a Vite asset resolved relative to the worker chunk, so it is under `/antenna_gnn/assets/` too. `index.html` references `/antenna_gnn/assets/…` (checked in CI). | Verified on Pages (live suite) and locally (52 + 156 e2e runs, C7.1) |
| 404s | The app has one page; state lives in the URL hash (`#p=v1.…`), which never reaches the server, so share links cannot 404. A missing model or meta.json shows an explicit error (C6.4). | Verified on Pages (share links load; error states tested locally, C6.4) |
| MIME types | `.wasm` must be `application/wasm` (GitHub Pages serves it so); `.onnx` is fetched as bytes, any type works. | Verified on Pages: `application/wasm` |
| Cross-origin isolation | Not needed: onnxruntime-web runs single-threaded wasm (`numThreads = 1`), so no SharedArrayBuffer, no COOP/COEP headers (GitHub Pages cannot set them anyway). | Verified on Pages (`crossOriginIsolated` false, inference works) |
| Caching | GitHub Pages sends a short `Cache-Control: max-age` with an ETag. Hashed assets (`assets/*`) can be cached safely; `model/antenna_gnn.onnx` and `meta.json` keep fixed names, so after a model update browsers may use the old files until the max-age passes and revalidate. | Verified on Pages: `max-age=600` + ETag, gzip |

Known gap: PRODUCT.md asks for the app to work offline after the first load; there is no service worker yet, so
offline use relies on the browser's HTTP cache only.
