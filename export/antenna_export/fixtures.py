"""Golden fixtures: webapp/fixtures/{N}x{N}.json, the contract for the ONNX and TypeScript layers.

Each grid file holds cases with the pattern, the exact 6-feature graph the deployed model consumes,
and the float64 reference outputs of export/antenna_export/predict.py:

- 5 reference patterns (the first stored graphs in webapp_private/graphs/{N}x{N} by sample index;
  only the metal pattern is used, never the stored true curve); 3 at 45x45 to keep that file
  under ~2 MB;
- 5 random patterns with exact total fill 0.30 / 0.45 / 0.60 / 0.70 / 0.80 (seed pixels included
  and forced to metal; free pixels drawn with a seeded RNG);
- if no case has a predicted curve with exactly 1 band, seeded random patterns are searched and
  the first hit is added as a "search" case.

Every case records `predicted_bands`. There is deliberately NO predicted 2+ band case: the deployed
model was never seen to predict a second band (0 or 1 on all 100 reference graphs, 2,000 random,
1,200 smoothed-random patterns and a 3,600-step hill-climb, C1.3). The multi-band scope notice is
therefore tested with synthetic curves (C5.4), and the files say so in `model_band_note`.

Number formats (so every layer can compare exactly):
- x: float32 values written as the shortest decimal that rounds back to the same float32;
- edge_index: int; edge_attr: int (the model reads them as float32: 0.0-4.0, exact);
- expected_z: float64 model output rounded to 1e-9; expected_db: float64 rounded to 1e-6.
Regenerating with the same checkpoint and data reproduces the files byte for byte
(tests/test_fixtures.py).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import torch

from . import bands
from .graph_builder import GRIDS, load_seed_mask
from .predict import DEFAULT_ARTIFACTS_DIR, PRIVATE, Predictor, graph_for_pattern, sha256_of

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT_DIR = REPO_ROOT / "webapp" / "fixtures"
GRAPHS_DIR = PRIVATE / "graphs"
SCHEMA = "antenna_gnn.fixtures/v1"
N_REFERENCE = {12: 5, 15: 5, 25: 5, 35: 5, 45: 3}   # 45x45 cases are ~0.25 MB each
MODEL_BAND_NOTE = ("No case has 2+ predicted bands: the deployed model was never observed to predict a second "
                   "band (C1.3 search over reference, random, smoothed-random and hill-climbed patterns). "
                   "Test multi-band handling with synthetic curves.")
RANDOM_FILLS = (0.30, 0.45, 0.60, 0.70, 0.80)
RNG_BASE = 1300               # random case seed: RNG_BASE + N
SEARCH_RNG = 1399             # band search seed
SEARCH_GRIDS = (12, 15, 25)   # small grids first, to keep files small
SEARCH_MAX_TRIES = 2000
Z_DECIMALS, DB_DECIMALS = 9, 6


# ----------------------------------------------------------------------------- number formatting

def _f32(values) -> list[float]:
    """float32 values as Python floats whose shortest repr is the shortest float32 round-trip string."""
    return [float(str(v)) for v in np.asarray(values, dtype=np.float32).reshape(-1)]


def _round(values, decimals: int) -> list[float]:
    return [float(v) for v in np.round(np.asarray(values, dtype=np.float64), decimals)]


# ----------------------------------------------------------------------------- patterns

def reference_samples(N: int) -> list[Path]:
    paths = sorted((GRAPHS_DIR / f"{N}x{N}").glob("sample_*.pt"), key=lambda p: int(p.stem.split("_")[1]))
    if len(paths) < N_REFERENCE[N]:
        raise FileNotFoundError(f"need {N_REFERENCE[N]} reference graphs in {GRAPHS_DIR / f'{N}x{N}'}, found {len(paths)}")
    return paths[:N_REFERENCE[N]]


def reference_pattern(path: Path, N: int) -> np.ndarray:
    stored = torch.load(path, weights_only=False)
    return stored.x[:-1, 0].numpy().reshape(N, N).astype(np.int64)


def random_pattern(N: int, fill: float, seed_mask: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Exactly round(fill * N^2) metal pixels: every seed pixel plus a random choice of free pixels."""
    n_metal = int(round(fill * N * N))
    n_seed = int(seed_mask.sum())
    if n_metal < n_seed:
        raise ValueError(f"fill {fill} is below the seed fill {n_seed / N / N:.3f} at {N}x{N}")
    free = np.flatnonzero(~seed_mask.reshape(-1))
    chosen = rng.choice(free, n_metal - n_seed, replace=False)
    flat = seed_mask.reshape(-1).astype(np.int64)
    flat[chosen] = 1
    return flat.reshape(N, N)


# ----------------------------------------------------------------------------- cases

def make_case(case_id: str, kind: str, pattern: np.ndarray, N: int, predictor: Predictor, **extra) -> dict:
    graph = graph_for_pattern(pattern, N)
    z = predictor.predict_z(graph)
    db = z * predictor.std + predictor.mean
    db_rounded = np.round(db, DB_DECIMALS)
    return {
        "id": case_id,
        "kind": kind,
        **extra,
        "N": N,
        "fill": round(float(pattern.mean()), 6),
        "pattern": [int(v) for v in pattern.reshape(-1)],
        "predicted_bands": bands.count_bands(db_rounded),
        "predicted_band_indices": bands.band_indices(db_rounded),
        "predicted_functioning": bands.is_functioning(db_rounded),
        "predicted_min_db": float(db_rounded.min()),
        "num_nodes": int(graph.x.size(0)),
        "num_edges": int(graph.edge_index.size(1)),
        "x": _f32(graph.x.numpy()),
        "edge_index": [[int(v) for v in row] for row in graph.edge_index.tolist()],
        "edge_attr": [[int(a), int(b)] for a, b in graph.edge_attr.numpy().astype(np.int64).tolist()],
        "expected_z": _round(z, Z_DECIMALS),
        "expected_db": [float(v) for v in db_rounded],
    }


def grid_cases(N: int, predictor: Predictor) -> list[dict]:
    seed_mask, source = load_seed_mask(N)
    if source != "file":
        raise FileNotFoundError(f"seed_mask_{N}.npy missing; fixtures must use the canonical mask")
    cases = []
    for path in reference_samples(N):
        cases.append(make_case(f"{N}x{N}-ref-{path.stem}", "reference", reference_pattern(path, N), N, predictor,
                               source=f"webapp_private/graphs/{N}x{N}/{path.name}"))
    rng = np.random.default_rng(RNG_BASE + N)
    for fill in RANDOM_FILLS:
        cases.append(make_case(f"{N}x{N}-rand-fill{int(round(fill * 100)):02d}", "random",
                               random_pattern(N, fill, seed_mask, rng), N, predictor,
                               target_fill=fill, rng_seed=RNG_BASE + N))
    return cases


def search_band_case(want: str, predictor: Predictor) -> dict:
    """First seeded random pattern whose predicted curve has `want` bands ("1"; "2+" is supported
    but not requested, see MODEL_BAND_NOTE)."""
    rng = np.random.default_rng(SEARCH_RNG)
    for attempt in range(SEARCH_MAX_TRIES):
        N = SEARCH_GRIDS[attempt % len(SEARCH_GRIDS)]
        seed_mask, _ = load_seed_mask(N)
        fill = float(rng.choice(RANDOM_FILLS))
        pattern = random_pattern(N, fill, seed_mask, rng)
        db = np.round(predictor.predict_pattern(pattern, N), DB_DECIMALS)
        n = bands.count_bands(db)
        if (want == "2+" and n >= 2) or (want == "1" and n == 1):
            return make_case(f"{N}x{N}-search-{want.replace('+', 'plus')}-try{attempt}", "search", pattern, N,
                             predictor, target_fill=fill, rng_seed=SEARCH_RNG, search_attempt=attempt,
                             search_target_bands=want)
    raise RuntimeError(f"no pattern with {want} predicted bands in {SEARCH_MAX_TRIES} tries")


def build_all(predictor: Predictor | None = None) -> dict[int, dict]:
    predictor = predictor or Predictor()
    meta = {
        "schema": SCHEMA,
        "generator": "export/scripts/make_fixtures.py",
        "checkpoint": "ch52_bal_ft45_s0.pt",
        "checkpoint_sha256": sha256_of(PRIVATE / "checkpoints" / "ch52_bal_ft45_s0.pt"),
        "s11_mean_sha256": sha256_of(DEFAULT_ARTIFACTS_DIR / "s11_mean.npy"),
        "s11_std_sha256": sha256_of(DEFAULT_ARTIFACTS_DIR / "s11_std.npy"),
        "freq_ghz": {"start": 1.0, "stop": 4.0, "points": 201},
        "band_rule": {"find_peaks_on": "-db", **bands.BAND_RULE, "functioning": "min(db) < -10"},
        "model_band_note": MODEL_BAND_NOTE,
        "formats": {"x": "float32, shortest round-trip decimal", "edge_attr": "int (model input float32)",
                    "expected_z": f"float64 rounded to 1e-{Z_DECIMALS}",
                    "expected_db": f"float64 rounded to 1e-{DB_DECIMALS}",
                    "pattern": "row-major (index i*N + j), 0 = air, 1 = metal"},
        "feature_columns": ["metal", "x_norm = j/(N-1)", "y_norm = i/(N-1)", "is_seed (-1 on virtual node)",
                            "dist_to_seed_centroid / N", "feed_component (8-connected)"],
    }
    files = {}
    for N in GRIDS:
        seed_mask, _ = load_seed_mask(N)
        files[N] = {**meta, "N": N, "seed_mask": [int(v) for v in seed_mask.reshape(-1)],
                    "cases": grid_cases(N, predictor)}
    all_cases = [c for f in files.values() for c in f["cases"]]
    if not any(c["predicted_bands"] == 1 for c in all_cases):
        case = search_band_case("1", predictor)
        files[case["N"]]["cases"].append(case)
    return files


def dumps(fixture: dict) -> str:
    return json.dumps(fixture, separators=(",", ":"), ensure_ascii=False) + "\n"


def write_all(out_dir: Path | str = DEFAULT_OUT_DIR, predictor: Predictor | None = None) -> list[Path]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    for N, fixture in build_all(predictor).items():
        path = out / f"{N}x{N}.json"
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(dumps(fixture))
        paths.append(path)
    return paths


def file_sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
