"""C1.1 parity: the extracted graph builder reproduces the stored training graphs EXACTLY.

Reference data (local only, never committed): webapp_private/graphs/{N}x{N}/sample_*.pt, written in
Chunks 5/12/41/43 by the frozen build_pyg_graph, and webapp_private/artifacts/seed_mask_{N}.npy.
Tolerance: exact (parity-check skill). These tests fail, rather than skip, when the data are missing.
"""
import inspect
import json
from pathlib import Path

import numpy as np
import pytest
import torch

from antenna_export import graph_builder as gb

REPO_ROOT = Path(__file__).resolve().parents[2]
PRIVATE = REPO_ROOT / "webapp_private"
GRAPHS = PRIVATE / "graphs"
FROZEN_NOTEBOOK = REPO_ROOT / "notebooks" / "chunk45_replay_finetune_35x35_extra.ipynb"
GRIDS = (12, 15, 25, 35, 45)

SAMPLES = sorted(GRAPHS.glob("*x*/sample_*.pt"))


def _grid_of(path: Path) -> int:
    return int(path.parent.name.split("x")[0])


def _load(path: Path):
    return torch.load(path, weights_only=False)


def _pattern(stored, N: int) -> np.ndarray:
    """The antenna's own metal pattern: the metal column of the pixel nodes, reshaped N x N."""
    return stored.x[:-1, 0].numpy().reshape(N, N).astype(np.int64)


def _sorted_edges(edge_index: torch.Tensor, edge_attr: torch.Tensor):
    pairs = edge_index.t().tolist()
    order = sorted(range(len(pairs)), key=lambda k: pairs[k])
    return [tuple(pairs[k]) for k in order], edge_attr[order]


def test_reference_graphs_present():
    assert GRAPHS.is_dir(), f"missing {GRAPHS}: copy the reference graphs into webapp_private/ (local only)"
    counts = {N: len(list((GRAPHS / f"{N}x{N}").glob("sample_*.pt"))) for N in GRIDS}
    assert all(c > 0 for c in counts.values()), f"no reference graphs for some grids: {counts}"


@pytest.mark.parametrize("path", SAMPLES, ids=lambda p: f"{p.parent.name}/{p.stem}")
def test_rebuilt_graph_equals_stored(path: Path):
    N = _grid_of(path)
    stored = _load(path)
    rebuilt = gb.pattern_to_graph(_pattern(stored, N), N)

    assert rebuilt.seed_mask_source == "file"
    assert "y" not in rebuilt, "pattern_to_graph must not return a target"

    # x: exact, same dtype and shape (N*N pixel nodes + 1 virtual node, 5 features)
    assert rebuilt.x.dtype == stored.x.dtype == torch.float32
    assert rebuilt.x.shape == stored.x.shape == (N * N + 1, 5)
    assert torch.equal(rebuilt.x, stored.x), f"x differs at {(rebuilt.x != stored.x).nonzero()[:5].tolist()}"

    # edge_index as a sorted set of pairs; edge_attr compared edge by edge in that order
    assert rebuilt.edge_index.dtype == stored.edge_index.dtype == torch.int64
    assert rebuilt.edge_attr.dtype == stored.edge_attr.dtype == torch.float32
    pairs_new, attr_new = _sorted_edges(rebuilt.edge_index, rebuilt.edge_attr)
    pairs_old, attr_old = _sorted_edges(stored.edge_index, stored.edge_attr)
    assert len(set(pairs_new)) == len(pairs_new), "duplicate edges in the rebuilt graph"
    assert pairs_new == pairs_old
    assert torch.equal(attr_new, attr_old)

    # stronger: the builder is verbatim, so even the edge ORDER must match
    assert torch.equal(rebuilt.edge_index, stored.edge_index)
    assert torch.equal(rebuilt.edge_attr, stored.edge_attr)


@pytest.mark.parametrize("N", GRIDS)
def test_generator_rule_reproduces_seed_mask_file(N: int):
    from_file = np.load(PRIVATE / "artifacts" / f"seed_mask_{N}.npy")
    assert np.array_equal(gb.generator_seed_mask(N), from_file.astype(bool))


@pytest.mark.parametrize("N", GRIDS)
def test_falls_back_to_generator_rule_when_mask_file_missing(N: int, tmp_path: Path):
    path = next(p for p in SAMPLES if _grid_of(p) == N)
    pattern = _pattern(_load(path), N)
    fallback = gb.pattern_to_graph(pattern, N, artifacts_dir=tmp_path)  # empty dir: no mask files
    reference = gb.pattern_to_graph(pattern, N)
    assert fallback.seed_mask_source == "generator_rule"
    for key in ("x", "edge_index", "edge_attr"):
        assert torch.equal(getattr(fallback, key), getattr(reference, key))


def test_builder_is_copied_verbatim_from_frozen_notebook():
    """Guards against 'cleaning up' the frozen builder: its source must equal the notebook's copy."""
    cells = json.loads(FROZEN_NOTEBOOK.read_text(encoding="utf-8"))["cells"]
    sources = ["".join(c["source"]) for c in cells if c["cell_type"] == "code"]
    cell = next(s for s in sources if "def build_pyg_graph(" in s)
    lines = cell.splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("def build_pyg_graph("))
    end = next((i for i in range(start + 1, len(lines)) if lines[i] and not lines[i][0].isspace()), len(lines))
    notebook_def = "\n".join(lines[start:end]).rstrip()
    assert inspect.getsource(gb.build_pyg_graph).rstrip() == notebook_def


@pytest.mark.parametrize(
    "pattern, N, message",
    [
        (np.ones((12, 13), dtype=int), 12, "shape"),
        (np.full((12, 12), 2), 12, "0/1"),
        (np.ones((20, 20), dtype=int), 20, "grid"),
        (np.zeros((12, 12), dtype=int), 12, "seed"),
    ],
    ids=["wrong-shape", "non-binary", "unsupported-grid", "seed-pixel-air"],
)
def test_pattern_to_graph_rejects_invalid_input(pattern, N, message):
    with pytest.raises(ValueError, match=message):
        gb.pattern_to_graph(pattern, N)
