"""Feed-connected conductor features shared by Chunk 30 and later notebooks."""

import math

import numpy as np
import torch
from scipy import ndimage


def _matlab_round(value: float) -> int:
    """MATLAB's positive half-away-from-zero rounding."""
    return math.floor(value + 0.5)


def feed_component_mask(pattern, N):
    """Return the 8-connected metal component containing the MATLAB feed pixel.

    The feed is at ``(round(0.25*N)-1, round(N/2)-1)`` in zero-based Python
    indexing.  If that pixel is not metal, the empty mask is returned.
    """
    array = np.asarray(pattern, dtype=bool)
    if array.shape != (N, N):
        raise ValueError(f"pattern shape {array.shape} does not match N={N}")
    row, col = _matlab_round(0.25 * N) - 1, _matlab_round(N / 2) - 1
    if not array[row, col]:
        return np.zeros((N, N), dtype=bool)
    labels, _ = ndimage.label(array, structure=np.ones((3, 3), dtype=int))
    return labels == labels[row, col]


class AppendFeedComponentFeature:
    """PyG transform that appends a feed-component indicator as the final feature."""

    def __call__(self, data):
        if data.x.size(1) != 5:
            raise ValueError("feed-component feature may only be appended to legacy 5-column graphs")
        n_pixels = data.x.size(0) - 1
        N = int(round(n_pixels ** 0.5))
        if N * N != n_pixels:
            raise ValueError("expected N*N pixel nodes followed by one virtual node")
        pattern = data.x[:n_pixels, 0].detach().cpu().numpy().reshape(N, N)
        mask = feed_component_mask(pattern, N).reshape(-1)
        feature = torch.zeros((data.x.size(0), 1), dtype=data.x.dtype, device=data.x.device)
        feature[:n_pixels, 0] = torch.as_tensor(mask, dtype=data.x.dtype, device=data.x.device)
        data.x = torch.cat([data.x, feature], dim=1)
        return data
