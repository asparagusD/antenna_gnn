"""Frozen graph builder for the antenna GNN, plus a pattern -> graph helper for the web app.

`build_pyg_graph` below is copied VERBATIM (comments included) from code cell 10 of
notebooks/chunk45_replay_finetune_35x35_extra.ipynb, which is itself the frozen Chunk 5 / Chunk 12
builder, verified there bit-for-bit on 20 rebuilt 35x35 graphs. Do not edit it:
tests/test_graph_builder.py compares its source with the notebook and its output with the stored
training graphs. What the web app needs beyond the frozen builder (seed-mask loading, input
validation, dropping the target) lives in the helpers after it.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import torch
from torch_geometric.data import Data

GRIDS = (12, 15, 25, 35, 45)  # 55x55 is excluded
DEFAULT_ARTIFACTS_DIR = Path(__file__).resolve().parents[2] / "webapp_private" / "artifacts"
SEED_MASK_FROM_FILE = "file"
SEED_MASK_FROM_GENERATOR_RULE = "generator_rule"


# ── Graph builder: VERBATIM from Chunk 5 / Chunk 12 (frozen), verified bit-for-bit on existing 35x35 graphs ──
def build_pyg_graph(patch_pattern, s11_db, seed_mask, N):
    # Compute seed centroid
    coords = np.argwhere(seed_mask)
    seed_r, seed_c = coords.mean(axis=0)

    # Node features: (N*N + 1) nodes, 5 features each
    node_feats = []
    for i in range(N):
        for j in range(N):
            metal    = float(patch_pattern[i, j])
            x_norm   = j / (N - 1)
            y_norm   = i / (N - 1)
            is_seed  = float(seed_mask[i, j])
            dist_f   = np.sqrt((i - seed_r)**2 + (j - seed_c)**2) / N
            node_feats.append([metal, x_norm, y_norm, is_seed, dist_f])

    # Virtual global node (index N*N): all zeros except placeholder (is_seed=-1 for virtual node)
    node_feats.append([0.0, 0.5, 0.5, -1.0, 0.0])
    node_feats = torch.tensor(node_feats, dtype=torch.float)

    # 4-connectivity edges
    edge_src, edge_dst, edge_attr = [], [], []
    etype_map = {(1,1):0, (1,0):1, (0,1):2, (0,0):3}
    for i in range(N):
        for j in range(N):
            idx = i * N + j
            m_ij = int(patch_pattern[i, j])
            for (di, dj, direction) in [(0,1,0),(0,-1,1),(-1,0,2),(1,0,3)]:
                ni, nj = i+di, j+dj
                if 0 <= ni < N and 0 <= nj < N:
                    nidx = ni * N + nj
                    m_nb = int(patch_pattern[ni, nj])
                    etype = etype_map[(m_ij, m_nb)]
                    edge_src.append(idx); edge_dst.append(nidx)
                    edge_attr.append([etype, direction])

    # Virtual node edges (connect to all metal pixels only)
    global_idx = N * N
    for i in range(N):
        for j in range(N):
            if patch_pattern[i, j] == 1:
                idx = i * N + j
                edge_src += [global_idx, idx]
                edge_dst += [idx, global_idx]
                edge_attr += [[4, 4], [4, 4]]  # virtual edge type

    edge_index = torch.tensor([edge_src, edge_dst], dtype=torch.long)
    edge_attr  = torch.tensor(edge_attr, dtype=torch.float)

    # Target
    # RAW dB on disk — Dataset z-scores at load (see normalization contract)
    y = torch.tensor(s11_db, dtype=torch.float).unsqueeze(0)  # (1, 201)

    return Data(x=node_feats, edge_index=edge_index, edge_attr=edge_attr, y=y)



# ----------------------------------------------------------------------------- helpers (not frozen)

def _matlab_round(value: float) -> int:
    """MATLAB round() for positive values: half away from zero (Python's round() is banker's)."""
    return math.floor(value + 0.5)


def generator_seed_mask(N: int) -> np.ndarray:
    """Always-metal pixels implied by the generator (alternate.m V3.1.1), as a bool (N, N) array.

    The centre block spans rows/cols round(0.35N) .. round(0.65N) (1-based, MATLAB rounding: the
    rule Chunk 41 checks), and the feed pixel (round(0.25N), round(N/2)) (1-based; feed_rc in
    src/feed_component.py) is always metal too. Reproduces every seed_mask_{N}.npy exactly
    (tests/test_graph_builder.py), but the files remain the source of truth.
    """
    lo, hi = _matlab_round(0.35 * N) - 1, _matlab_round(0.65 * N) - 1
    mask = np.zeros((N, N), dtype=bool)
    mask[lo:hi + 1, lo:hi + 1] = True
    mask[_matlab_round(0.25 * N) - 1, _matlab_round(N / 2) - 1] = True
    return mask


def load_seed_mask(N: int, artifacts_dir: Path | str | None = None) -> tuple[np.ndarray, str]:
    """Seed mask for grid N and its source: SEED_MASK_FROM_FILE or SEED_MASK_FROM_GENERATOR_RULE.

    Reads <artifacts_dir>/seed_mask_{N}.npy (default: webapp_private/artifacts); if that file is
    missing, falls back to generator_seed_mask(N).
    """
    directory = Path(artifacts_dir) if artifacts_dir is not None else DEFAULT_ARTIFACTS_DIR
    path = directory / f"seed_mask_{N}.npy"
    if path.is_file():
        mask = np.load(path)
        if mask.shape != (N, N):
            raise ValueError(f"{path} has shape {mask.shape}, expected {(N, N)}")
        return mask.astype(bool), SEED_MASK_FROM_FILE
    return generator_seed_mask(N), SEED_MASK_FROM_GENERATOR_RULE


def pattern_to_graph(pattern: np.ndarray, N: int, artifacts_dir: Path | str | None = None) -> Data:
    """Legacy 5-feature graph for an N x N 0/1 metal pattern, without a target.

    Calls the frozen build_pyg_graph unchanged (with a placeholder S11 that is then removed), so
    x (N*N + 1, 5), edge_index and edge_attr are exactly as in training; there is no `y`, and
    `seed_mask_source` is "file" or "generator_rule". The 6th (feed-component) feature is added
    separately by src/feed_component.AppendFeedComponentFeature.

    Raises ValueError for an unsupported grid, a wrong shape, values other than 0/1, or a seed
    pixel that is not metal (every training antenna has all its seed pixels metal).
    """
    if N not in GRIDS:
        raise ValueError(f"unsupported grid N={N}; supported grids are {GRIDS}")
    array = np.asarray(pattern)
    if array.shape != (N, N):
        raise ValueError(f"pattern shape {array.shape} does not match N={N}")
    if not np.isin(array, (0, 1)).all():
        raise ValueError("pattern must contain only 0/1 values")
    array = array.astype(np.int64)
    seed_mask, source = load_seed_mask(N, artifacts_dir)
    air_seeds = np.argwhere(seed_mask & (array == 0))
    if len(air_seeds):
        raise ValueError(f"{len(air_seeds)} seed pixel(s) are not metal, e.g. (row, col) {tuple(air_seeds[0].tolist())}")
    data = build_pyg_graph(array, np.zeros(201), seed_mask, N)
    del data.y
    data.seed_mask_source = source
    return data
