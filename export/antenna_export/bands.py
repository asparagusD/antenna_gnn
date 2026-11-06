"""Functioning and band rules, exactly as Chunk 51 used them to build the deployed model's data.

- Functioning: the curve's minimum is strictly below -10 dB (`y.min() < TAU`).
- Band: a dip found by `scipy.signal.find_peaks(-y, height=10, prominence=3, distance=10)` on the
  201-point grid np.linspace(1, 4, 201): at most -10 dB, at least 3 dB prominence, at least
  10 samples (150 MHz) from the next dip. find_peaks never reports the first or last sample, so a
  minimum at exactly 1 or 4 GHz is not a band (Chunk 51's `functioning_no_band` class).
"""
from __future__ import annotations

import numpy as np
from scipy.signal import find_peaks

TAU_DB = -10.0
BAND_RULE = dict(height=10.0, prominence=3.0, distance=10)  # Chunk 46/51 BAND, unchanged
FREQ_GHZ = np.linspace(1.0, 4.0, 201)


def band_indices(curve_db: np.ndarray) -> list[int]:
    """Indices (0..200) of the band dips of a 201-point |S11| curve in dB."""
    curve = np.asarray(curve_db, dtype=np.float64)
    if curve.shape != (201,):
        raise ValueError(f"expected a (201,) curve, got {curve.shape}")
    peaks, _ = find_peaks(-curve, **BAND_RULE)
    return [int(p) for p in peaks]


def count_bands(curve_db: np.ndarray) -> int:
    return len(band_indices(curve_db))


def is_functioning(curve_db: np.ndarray) -> bool:
    return bool(np.min(curve_db) < TAU_DB)
