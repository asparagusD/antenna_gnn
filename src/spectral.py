"""Chunk 29 V2 spectral features: normalized Laplacian x N^2 of the feed's 8-connected
metal component, diagonal edges included. Reproduces Chunk 29 Cell E v2 exactly."""

import numpy as np
from scipy.sparse import coo_matrix, diags, identity
from scipy.sparse.linalg import eigsh

from feed_component import PIXEL_SIZE_MM, feed_component_mask

M_EIG = 20
EIG_COLS = [f"eig_{i}" for i in range(M_EIG)]


def _laplacians(mask):
    idx = -np.ones(mask.shape, int)
    idx[mask] = np.arange(mask.sum())
    pairs = [(mask[:, :-1] & mask[:, 1:], idx[:, :-1], idx[:, 1:]),
             (mask[:-1, :] & mask[1:, :], idx[:-1, :], idx[1:, :]),
             (mask[:-1, :-1] & mask[1:, 1:], idx[:-1, :-1], idx[1:, 1:]),
             (mask[:-1, 1:] & mask[1:, :-1], idx[:-1, 1:], idx[1:, :-1])]
    src = np.concatenate([np.concatenate([a[m], b[m]]) for m, a, b in pairs])
    dst = np.concatenate([np.concatenate([b[m], a[m]]) for m, a, b in pairs])
    n = int(mask.sum())
    A = coo_matrix((np.ones(len(src)), (src, dst)), shape=(n, n)).tocsr()
    deg = np.asarray(A.sum(axis=1)).ravel()
    dinv = diags(1.0 / np.sqrt(deg))
    return (identity(n) - dinv @ A @ dinv).tocsc()


def eig_v2_features(pattern, N, pixel_mm=None):
    """Dict with n_nodes, connected/total metal area (mm^2), eig_valid and eig_0..eig_19 (V2)."""
    h = PIXEL_SIZE_MM[N] if pixel_mm is None else pixel_mm
    pattern = np.asarray(pattern) > 0.5
    comp = feed_component_mask(pattern, N)
    n = int(comp.sum())
    rec = {"n_nodes": n, "area_conn_mm2": n * h * h, "area_metal_mm2": float(pattern.sum()) * h * h}
    if n <= M_EIG + 1:
        return {**rec, "eig_valid": 0, **{c: 0.0 for c in EIG_COLS}}
    vals = np.sort(eigsh(_laplacians(comp), k=M_EIG + 1, sigma=-1e-3, which="LM",
                         tol=1e-9, return_eigenvectors=False))
    if abs(vals[0]) >= 1e-6:
        raise RuntimeError(f"smallest eigenvalue {vals[0]:.3g} is not zero: component not connected?")
    return {**rec, "eig_valid": 1, **{c: float(v * N * N) for c, v in zip(EIG_COLS, vals[1:])}}
