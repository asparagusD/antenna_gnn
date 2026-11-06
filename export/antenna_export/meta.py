"""Model metadata for the browser: webapp/public/model/meta.json (C2.3).

Everything the web app needs next to antenna_gnn.onnx: the frequency grid, the de-normalisation
statistics, per-grid seed masks and feed pixels, provenance hashes and the model's scope.

Number formats: s11_mean / s11_std are the exact float32 values of the canonical .npy files,
written as the double that equals each float32 (so `Float32Array.from(meta.s11_mean)` and plain JS
numbers agree exactly); freq_ghz is np.linspace(1, 4, 201) rounded to 1e-9 (exact multiples of
15 MHz). Seed masks are flattened row-major (index i*N + j); feed_rc is 0-based (row, col).
"""
from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path

import numpy as np

from . import bands
from .graph_builder import GRIDS, load_seed_mask
from .onnx_export import DEFAULT_ONNX_PATH, INPUT_NAMES, OPSET, OUTPUT_NAMES
from .predict import DEFAULT_CHECKPOINT, RUN_ID, expected_sha256, load_model, load_stats, sha256_of

DEFAULT_META_PATH = DEFAULT_ONNX_PATH.parent / "meta.json"
SCHEMA = "antenna_gnn.meta/v1"

# Chunk 52 report, "Values for the GATv2-vs-CNN table" (final model bal_ft45_s0, seed 0); checked against
# the notebook's saved output by tests/test_meta.py.
CHUNK52_TEST = {
    12: dict(test_set="Chunk 51 balanced", n_test=500, test_mse_db2=1.9359, test_mae_db=0.4947),
    15: dict(test_set="Chunk 51 balanced", n_test=500, test_mse_db2=1.6922, test_mae_db=0.4544),
    25: dict(test_set="unchanged (natural)", n_test=9983, test_mse_db2=1.4258, test_mae_db=0.3928),
    35: dict(test_set="Chunk 51 balanced", n_test=500, test_mse_db2=0.9884, test_mae_db=0.3143),
    45: dict(test_set="Chunk 51 balanced", n_test=500, test_mse_db2=1.0866, test_mae_db=0.3101),
}


def _matlab_round(value: float) -> int:
    return math.floor(value + 0.5)


def feed_rc(N: int) -> tuple[int, int]:
    """0-based (row, col) of the feed pixel, as src/feed_component.feed_rc (alternate.m V3.1.1)."""
    return _matlab_round(0.25 * N) - 1, _matlab_round(N / 2) - 1


def _exact_f32(values: np.ndarray) -> list[float]:
    return [float(v) for v in np.asarray(values, dtype=np.float32).reshape(-1)]


def build_meta(onnx_path: Path | str = DEFAULT_ONNX_PATH, export_date: str | None = None) -> dict:
    onnx_path = Path(onnx_path)
    checkpoint_sha = sha256_of(DEFAULT_CHECKPOINT)
    if checkpoint_sha != expected_sha256():
        raise ValueError("checkpoint SHA-256 does not match ch52_runs.csv")
    mean, std = load_stats()
    model = load_model()
    seed_masks, feeds = {}, {}
    for N in GRIDS:
        mask, source = load_seed_mask(N)
        if source != "file":
            raise FileNotFoundError(f"seed_mask_{N}.npy missing")
        seed_masks[str(N)] = [int(v) for v in mask.reshape(-1)]
        feeds[str(N)] = list(feed_rc(N))
    return {
        "schema": SCHEMA,
        "generator": "export/scripts/export_meta.py",
        "export_date": export_date or dt.date.today().isoformat(),
        "model": {
            "architecture": "src/model.py AntennaGNN(node_feat_dim=6, edge_feat_dim=2, hidden_dim=128, heads=8, "
                            "edge_dim=16, num_blocks=4, output_dim=201)",
            "parameter_count": int(sum(p.numel() for p in model.parameters())),
            "checkpoint": DEFAULT_CHECKPOINT.name,
            "checkpoint_sha256": checkpoint_sha,
            "run_id": RUN_ID,
        },
        "onnx": {
            "file": onnx_path.name,
            "sha256": sha256_of(onnx_path),
            "size_bytes": onnx_path.stat().st_size,
            "opset": OPSET,
            "inputs": {"x": ["num_nodes", 6, "float32"], "edge_index": [2, "num_edges", "int64"],
                       "edge_attr": ["num_edges", 2, "float32"]},
            "input_order": INPUT_NAMES,
            "output": {OUTPUT_NAMES[0]: [1, 201, "float32"]},
            "denormalise": "db = z * s11_std + s11_mean",
        },
        "freq_ghz": [round(float(f), 9) for f in np.linspace(1.0, 4.0, 201)],
        "s11_mean": _exact_f32(mean),
        "s11_std": _exact_f32(std),
        "grids": list(GRIDS),
        "seed_masks": seed_masks,
        "feed_rc": feeds,
        "feature_columns": ["metal", "x_norm = j/(N-1)", "y_norm = i/(N-1)", "is_seed (-1 on virtual node)",
                            "dist_to_seed_centroid / N", "feed_component (8-connected, 0 on virtual node)"],
        "rules": {
            "functioning": "min(db) < -10",
            "functioning_threshold_db": bands.TAU_DB,
            "band": {"find_peaks_on": "-db", **bands.BAND_RULE},
            "fill_warning_range": [0.30, 0.80],
        },
        "scope": {
            "trained_on": "single-band and non-functioning antennas (12/15/35/45); natural data (25×25)",
            "source_chunk": 52,
            "multi_band": "outside what the model learned; it was never observed to predict a second band (C1.3)",
            "test": {str(N): v for N, v in CHUNK52_TEST.items()},
        },
    }


def write_meta(path: Path | str = DEFAULT_META_PATH, onnx_path: Path | str = DEFAULT_ONNX_PATH,
               export_date: str | None = None) -> Path:
    path = Path(path)
    meta = build_meta(onnx_path, export_date)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(meta, indent=1, ensure_ascii=False) + "\n")
    return path
