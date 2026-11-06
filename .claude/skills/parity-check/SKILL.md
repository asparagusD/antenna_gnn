---
name: parity-check
description: Numerical-parity rules between the Python reference (src/model.py + frozen graph builder), the ONNX export and the TypeScript/browser implementation. Use whenever writing or changing graph building, model export, inference or fixtures.
---

# Parity contract

The Python reference in export/ is the source of truth. Every other layer is tested against webapp/fixtures/*.json.

| Layer | Compared with | Tolerance |
|---|---|---|
| export graph builder | stored training graphs (webapp_private/graphs) | exact |
| plain-PyTorch export model (if used) | src/model.py, float64 | ≤ 1e-9 |
| ONNX (Python onnxruntime) | fixture dB | ≤ 1e-4 dB |
| TypeScript graph builder | fixture x / edges / edge_attr | exact (float32) |
| TypeScript + onnxruntime-web (Node and browser) | fixture dB | ≤ 1e-4 dB |

Rules:
- Tolerances are never loosened to make a test pass. A failure is a bug → debug-protocol.
- Fixtures are regenerated only by export/scripts/make_fixtures.py, and the regeneration test must pass.
- Any change to graph building or the model invalidates the ONNX hash in meta.json → re-export, re-verify, and commit together with the reason.
