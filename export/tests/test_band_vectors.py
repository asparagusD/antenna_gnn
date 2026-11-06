"""C4.4: the committed band test vectors are reproducible and agree with antenna_export.bands."""
import importlib.util
import json
from pathlib import Path

import numpy as np

from antenna_export import bands

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "export" / "scripts" / "make_band_vectors.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("make_band_vectors", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_regenerating_reproduces_the_committed_vectors(tmp_path, monkeypatch):
    module = _load_script()
    committed = module.OUT.read_bytes()
    monkeypatch.setattr(module, "OUT", tmp_path / "band_vectors.json")
    module.main()
    assert (tmp_path / "band_vectors.json").read_bytes() == committed


def test_vectors_agree_with_the_python_band_rule():
    data = json.loads(_load_script().OUT.read_text(encoding="utf-8"))
    counts = set()
    for vector in data["vectors"]:
        db = np.array(vector["db"])
        assert vector["bands"] == bands.band_indices(db)
        assert vector["functioning"] == bands.is_functioning(db)
        counts.add(len(vector["bands"]))
    assert {0, 1, 2, 3} <= counts, "vectors must cover multi-band curves"
