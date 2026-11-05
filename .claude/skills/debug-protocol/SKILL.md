---
name: debug-protocol
description: The six-step debugging protocol and specialised playbooks (graph-builder mismatch, ONNX/ORT parity, UI, deployment). Use for ANY failing test, build error, numerical mismatch or visual bug.
---

# Debugging protocol

Log every step in DEBUG_LOG.md (date, subchunk, symptom, reproducer, hypotheses + status, root cause, fix commit).

1. Reproduce: smallest command/test that fails reliably. Paste the failing output.
2. Localise: find the first point where expected and actual diverge (bisect data, compare intermediates, `git bisect` across commits).
3. Hypothesise: one falsifiable hypothesis, written down.
4. Test it: one targeted check. Mark it confirmed or refuted.
5. Fix minimally + add a regression test.
6. Verify (reproducer, then make check) and record. Commit as fix: with the root cause.

STOP and report to the user after 3 refuted hypotheses, or if a fix would loosen a tolerance, skip a test, or swallow an error.

## Playbook: graph-builder mismatch
Compare in order and report the FIRST difference with its index and (row, col):
node count → x column by column → sorted edge pairs → edge_attr aligned by edge → feed-component column.
Usual causes: row-major vs column-major, normalisation denominators (N vs N−1), seed mask source, 4- vs 8-connectivity, virtual node index/edges.

## Playbook: ONNX / onnxruntime parity
Dump intermediates (input proj, each GATv2 block, pooling, readout) in float64 then float32; find the first diverging stage.
Usual causes: GATv2 self-loops and their edge-attr fill value, head concat vs mean, LeakyReLU slope, softmax over incoming edges per target node, metal-only mean pooling, int64 vs int32 indices, opset differences.

## Playbook: UI
Reproduce with a Playwright test (trace on), read console and network logs, separate state bugs (unit-test the reducer/core) from rendering bugs (visual check). Use /impeccable critique for visual issues, not guesswork.

## Playbook: deployment
Check: Vite base path, asset URLs via import.meta.env.BASE_URL, 404s for .onnx/.wasm, MIME types, caching, and that onnxruntime-web runs single-threaded (no COOP/COEP headers on GitHub Pages).
