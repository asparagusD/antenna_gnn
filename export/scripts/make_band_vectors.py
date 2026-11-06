#!/usr/bin/env python3
"""Write webapp/fixtures/analysis/band_vectors.json: synthetic |S11| curves with scipy's verdicts (C4.4).

The deployed model never predicted a second band (C1.3), so the golden fixtures cannot exercise
multi-band analysis. These seeded synthetic curves (0-4 dips, plateaus, edge minima, near-threshold
depths) carry what scipy.signal.find_peaks(-y, height=10, prominence=3, distance=10), the Chunk 51
band rule, returns for each, so the TypeScript port in webapp/src/core/analysis.ts can be checked
exactly. Curves are synthetic test data, not antenna measurements.

Usage (repository root, export venv):
    export/.venv/Scripts/python.exe export/scripts/make_band_vectors.py
"""
import json
from pathlib import Path

import numpy as np
from scipy.signal import find_peaks

from antenna_export.bands import BAND_RULE, TAU_DB

OUT = Path(__file__).resolve().parents[2] / "webapp" / "fixtures" / "analysis" / "band_vectors.json"
SEED = 4404
N_CURVES = 240
DECIMALS = 4


def curve(rng: np.random.Generator) -> np.ndarray:
    k = np.arange(201)
    base = rng.uniform(-6.0, -0.5) + rng.uniform(-2.0, 2.0) * (k / 200.0)
    y = np.full(201, base, dtype=np.float64) if np.isscalar(base) else base.astype(np.float64)
    for _ in range(int(rng.integers(0, 5))):
        centre = rng.uniform(-8.0, 208.0)            # sometimes outside the band: edge minima
        depth = rng.uniform(-38.0, -6.0)
        width = rng.uniform(1.0, 18.0)
        shape = np.exp(-0.5 * ((k - centre) / width) ** 2) if rng.random() < 0.5 else 1 / (1 + ((k - centre) / width) ** 2)
        y = y + (depth - y.max()) * shape
    y = y + rng.normal(0.0, rng.choice([0.0, 0.05, 0.4]), 201)
    if rng.random() < 0.25:
        y = np.round(y * 2) / 2                       # 0.5 dB steps create plateaus
    if rng.random() < 0.1:
        y = np.full(201, -10.0) + np.round(rng.normal(0, 0.3, 201), 1)   # hugging the threshold
    return np.round(np.minimum(y, 0.0), DECIMALS)


def verdict(y: np.ndarray) -> dict:
    peaks, props = find_peaks(-y, **BAND_RULE)
    return {
        "db": [float(v) for v in y],
        "bands": [int(p) for p in peaks],
        "prominences": [round(float(p), 9) for p in props["prominences"]],
        "functioning": bool(y.min() < TAU_DB),
    }


def main() -> int:
    rng = np.random.default_rng(SEED)
    vectors = [verdict(curve(rng)) for _ in range(N_CURVES)]
    counts = {n: sum(len(v["bands"]) == n for v in vectors) for n in range(6)}
    payload = {
        "schema": "antenna_gnn.band_vectors/v1",
        "generator": "export/scripts/make_band_vectors.py",
        "rule": {"find_peaks_on": "-db", **BAND_RULE, "functioning": "min(db) < -10"},
        "seed": SEED,
        "note": "Synthetic curves (not antenna data) with scipy's band verdicts, for exact TypeScript parity.",
        "vectors": vectors,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(payload, separators=(",", ":")) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e3:.0f} kB); curves by band count: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
