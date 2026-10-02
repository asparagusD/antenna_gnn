"""Feed-connected conductor features shared by Chunk 30 and later notebooks.

The conductor is 8-connected: alternate.m draws every pixel at 1.011 x its pitch, so
diagonal neighbours overlap at their corners and conduct (confirmed in Chunk 29 Cell E).
"""

import math

import numpy as np
import torch
from scipy import ndimage

# Pixel pitch in mm per grid (patch side ~32.4 mm). Chunk 29 asserted grid*h within 1%.
PIXEL_SIZE_MM = {25: 1.296, 35: 0.925, 45: 0.720}
_STRUCT8 = np.ones((3, 3), dtype=int)


def _matlab_round(value: float) -> int:
    """MATLAB's half-away-from-zero rounding for positive values (Python round() is banker's)."""
    return math.floor(value + 0.5)


def feed_rc(N):
    """Zero-based (row, col) of the feed pixel, per alternate.m V3.1.1."""
    return _matlab_round(0.25 * N) - 1, _matlab_round(N / 2) - 1


def feed_component_mask(pattern, N):
    """8-connected metal component containing the feed pixel; empty if the feed is not metal."""
    array = np.asarray(pattern) > 0.5
    if array.shape != (N, N):
        raise ValueError(f"pattern shape {array.shape} does not match N={N}")
    row, col = feed_rc(N)
    if not array[row, col]:
        return np.zeros((N, N), dtype=bool)
    labels, _ = ndimage.label(array, structure=_STRUCT8)
    return labels == labels[row, col]


def feed_distance_mm(N, pixel_mm=None):
    """(N*N,) distance of every pixel centre from the feed pixel centre, in mm (row-major i*N+j)."""
    h = PIXEL_SIZE_MM[N] if pixel_mm is None else pixel_mm
    r0, c0 = feed_rc(N)
    ii, jj = np.meshgrid(np.arange(N), np.arange(N), indexing="ij")
    return (np.sqrt((ii - r0) ** 2 + (jj - c0) ** 2) * h).reshape(-1)


def _grid_of(data):
    n_pixels = data.x.size(0) - 1
    N = int(round(n_pixels ** 0.5))
    if N * N != n_pixels:
        raise ValueError("expected N*N pixel nodes followed by one virtual node")
    if float(data.x[-1, 3]) != -1.0:
        raise ValueError("last node is not the virtual node (x[-1, 3] != -1)")
    return N, n_pixels


class AppendFeedComponentFeature:
    """PyG transform appending x[:, 5] = 1 for pixels in the feed's 8-connected metal component.

    Appended at the END so every legacy column index (metal at 0, is_seed at 3) is unchanged.
    The virtual node gets 0. Refuses graphs that are not exactly the legacy 5-column layout.
    """

    def __call__(self, data):
        if data.x.size(1) != 5:
            raise ValueError("feed-component feature may only be appended to legacy 5-column graphs")
        N, n_pixels = _grid_of(data)
        pattern = data.x[:n_pixels, 0].detach().cpu().numpy().reshape(N, N)
        mask = feed_component_mask(pattern, N).reshape(-1)
        feature = torch.zeros((data.x.size(0), 1), dtype=data.x.dtype, device=data.x.device)
        feature[:n_pixels, 0] = torch.as_tensor(mask, dtype=data.x.dtype, device=data.x.device)
        data.x = torch.cat([data.x, feature], dim=1)
        return data
