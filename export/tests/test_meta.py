"""C2.3: webapp/public/model/meta.json round-trips its sources and its hashes match the files."""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pytest

from antenna_export import meta
from antenna_export.graph_builder import GRIDS, load_seed_mask
from antenna_export.onnx_export import DEFAULT_ONNX_PATH
from antenna_export.predict import DEFAULT_CHECKPOINT, expected_sha256, load_stats, sha256_of

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "src"))
import feed_component  # noqa: E402

CHUNK52 = REPO_ROOT / "notebooks" / "chunk52_balanced_replay_finetune_gatv2.ipynb"


@pytest.fixture(scope="module")
def data():
    assert meta.DEFAULT_META_PATH.is_file(), "missing meta.json; run export/scripts/export_meta.py"
    return json.loads(meta.DEFAULT_META_PATH.read_text(encoding="utf-8"))


def test_schema_and_basic_fields(data):
    assert data["schema"] == meta.SCHEMA
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", data["export_date"])
    assert data["grids"] == list(GRIDS)
    assert data["model"]["parameter_count"] == 587_129
    assert data["model"]["checkpoint"] == "ch52_bal_ft45_s0.pt"


def test_round_trip_matches_a_fresh_build(data):
    """Rebuilding (same date) gives exactly the committed content."""
    assert meta.build_meta(export_date=data["export_date"]) == data


def test_freq_grid(data):
    freq = np.array(data["freq_ghz"])
    assert freq.shape == (201,) and freq[0] == 1.0 and freq[-1] == 4.0
    assert np.allclose(freq, np.linspace(1, 4, 201), atol=1e-12, rtol=0)


def test_statistics_are_the_exact_float32_values(data):
    mean, std = load_stats()
    assert np.array_equal(np.array(data["s11_mean"], dtype=np.float32), mean.astype(np.float32))
    assert np.array_equal(np.array(data["s11_std"], dtype=np.float32), std.astype(np.float32))
    assert np.array_equal(np.array(data["s11_mean"]), mean)  # the doubles equal the float32 values exactly


@pytest.mark.parametrize("N", GRIDS)
def test_seed_masks_and_feed_pixels(data, N: int):
    mask = np.array(data["seed_masks"][str(N)]).reshape(N, N).astype(bool)
    assert np.array_equal(mask, load_seed_mask(N)[0])
    assert tuple(data["feed_rc"][str(N)]) == feed_component.feed_rc(N)
    row, col = data["feed_rc"][str(N)]
    assert mask[row, col], "the feed pixel is part of the seed mask"


def test_hashes_and_size_match_the_files(data):
    assert data["onnx"]["sha256"] == sha256_of(DEFAULT_ONNX_PATH)
    assert data["onnx"]["size_bytes"] == DEFAULT_ONNX_PATH.stat().st_size
    assert data["model"]["checkpoint_sha256"] == sha256_of(DEFAULT_CHECKPOINT) == expected_sha256()


def test_onnx_size_is_reasonable(data):
    assert data["onnx"]["size_bytes"] < 5_000_000


def test_scope_numbers_match_the_chunk52_report(data):
    cells = json.loads(CHUNK52.read_text(encoding="utf-8"))["cells"]
    text = "".join("".join(o.get("text", "")) for c in cells for o in c.get("outputs", []))
    table = text[text.index("Values for the GATv2-vs-CNN table"):]
    scope = data["scope"]
    assert scope["source_chunk"] == 52 and "single-band and non-functioning" in scope["trained_on"]
    for N in GRIDS:
        row = re.search(rf"\|\s*{N}x{N}\s*\|\s*(\d+)\s*\|[^|]*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|", table)
        assert row, f"{N}x{N} row not found in the Chunk 52 report"
        n_test, mse, mae = int(row.group(1)), float(row.group(2)), float(row.group(3))
        entry = scope["test"][str(N)]
        assert (entry["n_test"], entry["test_mse_db2"], entry["test_mae_db"]) == (n_test, mse, mae)
