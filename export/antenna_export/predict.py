"""Reference predictor: the deployed checkpoint, run in float64 on CPU.

Pipeline (all pieces imported from the repository, not copied):
    N x N pattern --graph_builder.pattern_to_graph--> 5-feature graph (frozen builder)
                  --src/feed_component.AppendFeedComponentFeature--> 6-feature graph
                  --src/model.AntennaGNN (ch52_bal_ft45_s0, float64)--> z (201)
                  --z * s11_std + s11_mean--> |S11| in dB (201 points, 1-4 GHz)

The checkpoint's SHA-256 is checked against the bal_ft45_s0 row of ch52_runs.csv before loading.
De-normalisation follows Chunk 52's predict(): `z * STD + MEAN` (training z-scored with STD + 1e-8).
"""
from __future__ import annotations

import csv
import hashlib
import sys
from pathlib import Path

import numpy as np
import torch
from torch_geometric.data import Data

from .graph_builder import pattern_to_graph

REPO_ROOT = Path(__file__).resolve().parents[2]
PRIVATE = REPO_ROOT / "webapp_private"
DEFAULT_CHECKPOINT = PRIVATE / "checkpoints" / "ch52_bal_ft45_s0.pt"
DEFAULT_ARTIFACTS_DIR = PRIVATE / "artifacts"
DEFAULT_RUNS_CSV = DEFAULT_ARTIFACTS_DIR / "ch52_runs.csv"
RUN_ID = "bal_ft45_s0"
MODEL_KWARGS = dict(node_feat_dim=6, edge_feat_dim=2, hidden_dim=128, heads=8, edge_dim=16,
                    num_blocks=4, output_dim=201)  # as gnn(6) in Chunk 52

# src/ is a flat directory of modules (notebooks put it on sys.path), not a package.
if str(REPO_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "src"))
from feed_component import AppendFeedComponentFeature  # noqa: E402
from model import AntennaGNN  # noqa: E402


def sha256_of(path: Path | str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def expected_sha256(runs_csv: Path | str = DEFAULT_RUNS_CSV, run_id: str = RUN_ID) -> str:
    with open(runs_csv, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["run_id"] == run_id]
    if len(rows) != 1:
        raise ValueError(f"expected exactly one {run_id} row in {runs_csv}, found {len(rows)}")
    return rows[0]["checkpoint_sha256"]


def load_model(checkpoint: Path | str = DEFAULT_CHECKPOINT, runs_csv: Path | str = DEFAULT_RUNS_CSV,
               run_id: str = RUN_ID) -> AntennaGNN:
    """AntennaGNN(6 inputs) with the checkpoint's `model_state`, in float64, CPU, eval mode."""
    actual, expected = sha256_of(checkpoint), expected_sha256(runs_csv, run_id)
    if actual != expected:
        raise ValueError(f"checkpoint SHA-256 {actual} does not match {run_id} in {runs_csv} ({expected})")
    state = torch.load(checkpoint, map_location="cpu", weights_only=False)["model_state"]
    state = {k[7:] if k.startswith("module.") else k: v for k, v in state.items()}  # as Chunk 52 state_of()
    model = AntennaGNN(**MODEL_KWARGS)
    model.load_state_dict(state, strict=True)
    return model.double().cpu().eval()


def load_stats(artifacts_dir: Path | str = DEFAULT_ARTIFACTS_DIR) -> tuple[np.ndarray, np.ndarray]:
    """Canonical s11_mean / s11_std (201,) as float64 (Chunk 5 statistics; never recomputed)."""
    directory = Path(artifacts_dir)
    mean = np.load(directory / "s11_mean.npy").astype(np.float64)
    std = np.load(directory / "s11_std.npy").astype(np.float64)
    if mean.shape != (201,) or std.shape != (201,):
        raise ValueError(f"expected (201,) statistics, got {mean.shape} and {std.shape}")
    return mean, std


def with_feed_feature(graph5: Data) -> Data:
    """6-feature copy of a legacy 5-feature graph (x[:, 5] = feed's 8-connected metal component)."""
    return AppendFeedComponentFeature()(Data(x=graph5.x.clone(), edge_index=graph5.edge_index,
                                             edge_attr=graph5.edge_attr))


def graph_for_pattern(pattern: np.ndarray, N: int, artifacts_dir: Path | str | None = None) -> Data:
    """N x N 0/1 pattern -> the 6-feature graph the deployed model consumes."""
    return with_feed_feature(pattern_to_graph(pattern, N, artifacts_dir))


class Predictor:
    """Deployed model plus statistics; predictions are 201 |S11| values in dB (float64)."""

    def __init__(self, checkpoint: Path | str = DEFAULT_CHECKPOINT, runs_csv: Path | str = DEFAULT_RUNS_CSV,
                 artifacts_dir: Path | str = DEFAULT_ARTIFACTS_DIR):
        self.model = load_model(checkpoint, runs_csv)
        self.mean, self.std = load_stats(artifacts_dir)
        self.artifacts_dir = artifacts_dir

    @torch.no_grad()
    def predict_z(self, graph6: Data) -> np.ndarray:
        """Raw model output (z-scored, 201) for one 6-feature graph, computed in float64."""
        n_nodes = graph6.x.size(0)
        batch = Data(x=graph6.x.double(), edge_index=graph6.edge_index, edge_attr=graph6.edge_attr.double(),
                     batch=torch.zeros(n_nodes, dtype=torch.long))
        return self.model(batch).reshape(-1).numpy()

    def predict_graph(self, graph5: Data) -> np.ndarray:
        """|S11| in dB for a legacy 5-feature graph (e.g. a stored training graph)."""
        return self.predict_z(with_feed_feature(graph5)) * self.std + self.mean

    def predict_pattern(self, pattern: np.ndarray, N: int) -> np.ndarray:
        """|S11| in dB (201 points, np.linspace(1, 4, 201) GHz) for an N x N 0/1 pattern."""
        return self.predict_z(graph_for_pattern(pattern, N, self.artifacts_dir)) * self.std + self.mean
