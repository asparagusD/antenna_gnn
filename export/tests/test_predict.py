"""C1.2: reference predictor (deployed checkpoint, float64 CPU) and the feed-component feature.

Reference data (local only, never committed): webapp_private/checkpoints/ch52_bal_ft45_s0.pt,
webapp_private/artifacts/{ch52_runs.csv, s11_mean.npy, s11_std.npy, seed_mask_*.npy} and the stored
graphs in webapp_private/graphs (Chunk 51 test antennas for 12/15/35/45, original test antennas
for 25x25). These tests fail, rather than skip, when the data are missing.
"""
import shutil
import sys
from pathlib import Path

import numpy as np
import pytest
import torch
from torch_geometric.data import Data

from antenna_export import predict as pr

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "src"))
from feed_component import AppendFeedComponentFeature  # noqa: E402  (src/ is not a package)

GRAPHS = REPO_ROOT / "webapp_private" / "graphs"
GRIDS = (12, 15, 25, 35, 45)
SAMPLES = sorted(GRAPHS.glob("*x*/sample_*.pt"))
MAE_LIMIT_DB = 1.0


def _grid_of(path: Path) -> int:
    return int(path.parent.name.split("x")[0])


def _load(path: Path):
    return torch.load(path, weights_only=False)


def _pattern(stored, N: int) -> np.ndarray:
    return stored.x[:-1, 0].numpy().reshape(N, N).astype(np.int64)


@pytest.fixture(scope="module")
def predictor():
    return pr.Predictor()


def test_parameter_count(predictor):
    assert sum(p.numel() for p in predictor.model.parameters()) == 587_129


def test_model_runs_in_float64_on_cpu(predictor):
    params = list(predictor.model.parameters())
    assert all(p.dtype == torch.float64 and p.device.type == "cpu" for p in params)
    assert not predictor.model.training


def test_checkpoint_hash_mismatch_is_rejected(tmp_path: Path):
    bad = tmp_path / "ch52_bal_ft45_s0.pt"
    shutil.copyfile(pr.DEFAULT_CHECKPOINT, bad)
    with open(bad, "ab") as f:
        f.write(b"\0")  # one extra byte: a different file
    with pytest.raises(ValueError, match="SHA-256"):
        pr.load_model(checkpoint=bad)


@pytest.mark.parametrize("path", SAMPLES, ids=lambda p: f"{p.parent.name}/{p.stem}")
def test_feed_feature_equals_transform_on_reference_graph(path: Path):
    N = _grid_of(path)
    stored = _load(path)
    expected = AppendFeedComponentFeature()(Data(x=stored.x.clone(), edge_index=stored.edge_index,
                                                 edge_attr=stored.edge_attr))
    built = pr.graph_for_pattern(_pattern(stored, N), N)  # pattern -> frozen builder -> feed feature
    assert built.x.shape == (N * N + 1, 6)
    assert torch.equal(built.x, expected.x)
    assert torch.equal(built.edge_index, expected.edge_index)
    assert torch.equal(built.edge_attr, expected.edge_attr)


def test_prediction_shape_dtype_and_determinism(predictor):
    stored = _load(SAMPLES[0])
    N = _grid_of(SAMPLES[0])
    first = predictor.predict_pattern(_pattern(stored, N), N)
    second = predictor.predict_pattern(_pattern(stored, N), N)
    assert first.shape == (201,) and first.dtype == np.float64 and np.isfinite(first).all()
    assert np.array_equal(first, second)


def test_pattern_and_stored_graph_predictions_agree(predictor):
    path = SAMPLES[0]
    stored = _load(path)
    N = _grid_of(path)
    assert np.array_equal(predictor.predict_graph(stored), predictor.predict_pattern(_pattern(stored, N), N))


@pytest.mark.parametrize("N", GRIDS)
def test_sanity_mae_against_true_curves(predictor, N: int):
    paths = [p for p in SAMPLES if _grid_of(p) == N]
    assert len(paths) >= 10, f"too few reference graphs for {N}x{N}"
    maes = []
    for path in paths:
        stored = _load(path)
        truth = stored.y.reshape(-1).double().numpy()
        maes.append(float(np.abs(predictor.predict_pattern(_pattern(stored, N), N) - truth).mean()))
    maes = np.array(maes)
    print(f"\n{N}x{N}: n={len(maes)} mean MAE {maes.mean():.4f} dB | median {np.median(maes):.4f} | "
          f"min {maes.min():.4f} | max {maes.max():.4f}")
    assert maes.mean() < MAE_LIMIT_DB
