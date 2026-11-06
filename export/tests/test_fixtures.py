"""C1.3: the committed golden fixtures (webapp/fixtures/*.json) are reproducible and self-consistent."""
import json
from pathlib import Path

import numpy as np
import pytest

from antenna_export import bands, fixtures
from antenna_export.graph_builder import GRIDS, load_seed_mask
from antenna_export.predict import Predictor, graph_for_pattern

COMMITTED = fixtures.DEFAULT_OUT_DIR
MAX_BYTES = 2_000_000


def _load(N: int) -> dict:
    return json.loads((COMMITTED / f"{N}x{N}.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def predictor():
    return Predictor()


def test_regenerating_reproduces_committed_files_exactly(predictor, tmp_path: Path):
    written = fixtures.write_all(tmp_path, predictor)
    assert sorted(p.name for p in written) == sorted(f"{N}x{N}.json" for N in GRIDS)
    for path in written:
        committed = COMMITTED / path.name
        assert committed.is_file(), f"{committed} is not committed; run export/scripts/make_fixtures.py"
        assert path.read_bytes() == committed.read_bytes(), f"{path.name} differs from the committed fixture"


@pytest.mark.parametrize("N", GRIDS)
def test_file_size_and_header(N: int):
    path = COMMITTED / f"{N}x{N}.json"
    assert path.stat().st_size < MAX_BYTES
    data = _load(N)
    assert data["schema"] == fixtures.SCHEMA and data["N"] == N
    assert data["freq_ghz"] == {"start": 1.0, "stop": 4.0, "points": 201}
    assert data["seed_mask"] == [int(v) for v in load_seed_mask(N)[0].reshape(-1)]
    assert "model_band_note" in data
    kinds = [c["kind"] for c in data["cases"]]
    assert kinds.count("reference") == fixtures.N_REFERENCE[N] and kinds.count("random") == 5


@pytest.mark.parametrize("N", GRIDS)
def test_cases_are_self_consistent(N: int):
    data = _load(N)
    seed = np.array(data["seed_mask"], dtype=bool)
    for case in data["cases"]:
        pattern = np.array(case["pattern"], dtype=np.int64)
        assert case["N"] == N and pattern.shape == (N * N,) and set(np.unique(pattern)) <= {0, 1}
        assert pattern[seed].all(), f"{case['id']}: seed pixels must be metal"
        assert case["fill"] == round(float(pattern.mean()), 6)
        graph = graph_for_pattern(pattern.reshape(N, N), N)
        x = np.array(case["x"], dtype=np.float32).reshape(-1, 6)
        assert np.array_equal(x, graph.x.numpy()), f"{case['id']}: x does not round-trip to float32 exactly"
        assert np.array_equal(np.array(case["edge_index"]), graph.edge_index.numpy())
        assert np.array_equal(np.array(case["edge_attr"], dtype=np.float32), graph.edge_attr.numpy())
        assert case["num_nodes"] == N * N + 1 and case["num_edges"] == 4 * N * (N - 1) + 2 * int(pattern.sum())
        db = np.array(case["expected_db"])
        assert len(db) == 201 and len(case["expected_z"]) == 201
        assert case["predicted_bands"] == bands.count_bands(db) == len(case["predicted_band_indices"])
        assert case["predicted_functioning"] == bands.is_functioning(db)


def test_random_cases_hit_their_target_fill():
    """Exactly round(target * N^2) metal pixels, so |fill - target| <= 0.5 / N^2 (equality on half-pixel targets)."""
    for N in GRIDS:
        for case in _load(N)["cases"]:
            if case["kind"] == "random":
                assert sum(case["pattern"]) == int(round(case["target_fill"] * N * N)), case["id"]
                assert abs(sum(case["pattern"]) / (N * N) - case["target_fill"]) <= 0.5 / (N * N) + 1e-12


def test_expected_db_matches_expected_z(predictor):
    for N in GRIDS:
        for case in _load(N)["cases"]:
            db = np.array(case["expected_z"]) * predictor.std + predictor.mean
            assert np.abs(db - np.array(case["expected_db"])).max() < 1e-6 + 1e-9 * predictor.std.max()


def test_band_coverage_for_scope_notice_tests():
    counts = [c["predicted_bands"] for N in GRIDS for c in _load(N)["cases"]]
    assert counts.count(1) >= 1, "need at least one predicted single-band case"
    assert counts.count(0) >= 1, "need at least one predicted no-band case"
