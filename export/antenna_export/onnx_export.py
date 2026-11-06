"""Direct ONNX export of the deployed model (C2.1) and its onnxruntime parity check.

The exported graph is src/model.AntennaGNN (ch52_bal_ft45_s0, float32) behind a thin wrapper that
takes the three graph tensors directly and builds the all-zero `batch` vector inside (one graph per
call), so the ONNX model has inputs x [num_nodes, 6] float32, edge_index [2, num_edges] int64,
edge_attr [num_edges, 2] float32 and output z [1, 201] float32 (z-scored |S11|). The model itself is
not modified; PyG's GATv2Conv, global_mean_pool and the boolean metal / virtual-node masks are
exported as they are.

Parity contract (parity-check skill): for every case of every webapp/fixtures/*.json,
max |(z_onnx * s11_std + s11_mean) - expected_db| <= 1e-4 dB, with onnxruntime on CPU.
"""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import torch
from torch import nn

from .fixtures import DEFAULT_OUT_DIR as FIXTURES_DIR
from .graph_builder import GRIDS
from .predict import load_model, load_stats

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ONNX_PATH = REPO_ROOT / "webapp" / "public" / "model" / "antenna_gnn.onnx"
OPSET = 18
INPUT_NAMES = ["x", "edge_index", "edge_attr"]
OUTPUT_NAMES = ["z"]
PARITY_TOL_DB = 1e-4


class SingleGraphAntennaGNN(nn.Module):
    """(x, edge_index, edge_attr) -> z for ONE graph; the model's `batch` is all zeros."""

    def __init__(self, model: nn.Module):
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor, edge_attr: torch.Tensor) -> torch.Tensor:
        batch = torch.zeros(x.size(0), dtype=torch.long, device=x.device)
        return self.model(SimpleNamespace(x=x, edge_index=edge_index, edge_attr=edge_attr, batch=batch))


def fixture_cases() -> list[dict]:
    cases = []
    for N in GRIDS:
        data = json.loads((FIXTURES_DIR / f"{N}x{N}.json").read_text(encoding="utf-8"))
        cases.extend(data["cases"])
    return cases


def case_inputs(case: dict) -> dict[str, np.ndarray]:
    return {
        "x": np.asarray(case["x"], dtype=np.float32).reshape(-1, 6),
        "edge_index": np.asarray(case["edge_index"], dtype=np.int64),
        "edge_attr": np.asarray(case["edge_attr"], dtype=np.float32),
    }


def export(path: Path | str = DEFAULT_ONNX_PATH, exporter: str = "torchscript") -> Path:
    """Export the float32 wrapper. `exporter`: "torchscript" (works) or "dynamo" (torch.export; fails on
    PyG scatter with data-dependent shapes, kept to reproduce DEBUG_LOG.md)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    wrapper = SingleGraphAntennaGNN(load_model().float()).eval()
    example = case_inputs(fixture_cases()[0])
    args = tuple(torch.from_numpy(example[k]) for k in INPUT_NAMES)
    if exporter == "dynamo":
        nodes, edges = torch.export.Dim("num_nodes"), torch.export.Dim("num_edges")
        dynamic_shapes = {"x": {0: nodes}, "edge_index": {1: edges}, "edge_attr": {0: edges}}
        program = torch.onnx.export(wrapper, args, input_names=INPUT_NAMES, output_names=OUTPUT_NAMES,
                                    opset_version=OPSET, dynamo=True, dynamic_shapes=dynamic_shapes,
                                    external_data=False)
        program.save(str(path), external_data=False)
    elif exporter == "torchscript":
        dynamic_axes = {"x": {0: "num_nodes"}, "edge_index": {1: "num_edges"}, "edge_attr": {0: "num_edges"}}
        torch.onnx.export(wrapper, args, str(path), input_names=INPUT_NAMES, output_names=OUTPUT_NAMES,
                          opset_version=OPSET, dynamo=False, dynamic_axes=dynamic_axes)
        _declare_output_shape(path)
    else:
        raise ValueError(f"unknown exporter {exporter!r}")
    return path


def _declare_output_shape(path: Path) -> None:
    """Declare z as [1, 201]. The TorchScript exporter labels the batch axis symbolically
    ("Gemmz_dim_0") although one graph always gives one row; only the declared shape changes."""
    import onnx

    model = onnx.load(str(path))
    dims = model.graph.output[0].type.tensor_type.shape.dim
    if len(dims) != 2 or dims[1].dim_value != 201:
        raise ValueError(f"unexpected output shape declaration {dims}")
    dims[0].Clear()
    dims[0].dim_value = 1
    onnx.checker.check_model(model)
    onnx.save(model, str(path))


def check_parity(path: Path | str = DEFAULT_ONNX_PATH) -> dict:
    """Run onnxruntime (CPU) on every fixture case; returns per-case and overall max |dB error|."""
    import onnx
    import onnxruntime as ort

    model = onnx.load(str(path))
    onnx.checker.check_model(model)
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    mean, std = load_stats()
    per_case = {}
    for case in fixture_cases():
        (z,) = session.run(OUTPUT_NAMES, case_inputs(case))
        if z.shape != (1, 201):
            raise ValueError(f"{case['id']}: output shape {z.shape}, expected (1, 201)")
        db = z.reshape(-1).astype(np.float64) * std + mean
        per_case[case["id"]] = float(np.abs(db - np.asarray(case["expected_db"])).max())
    return {
        "opset": max(o.version for o in model.opset_import if o.domain in ("", "ai.onnx")),
        "inputs": [(i.name, [d.dim_param or d.dim_value for d in i.type.tensor_type.shape.dim])
                   for i in model.graph.input],
        "outputs": [(o.name, [d.dim_param or d.dim_value for d in o.type.tensor_type.shape.dim])
                    for o in model.graph.output],
        "per_case_max_abs_db": per_case,
        "max_abs_db": max(per_case.values()),
        "cases": len(per_case),
    }
