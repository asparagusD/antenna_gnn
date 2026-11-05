"""C2.1: the exported ONNX model has the agreed interface and matches every golden fixture.

Needs webapp/public/model/antenna_gnn.onnx (export/scripts/export_onnx.py) and the local
statistics in webapp_private/artifacts (for de-normalisation).
"""
import numpy as np
import onnx
import onnxruntime as ort
import pytest

from antenna_export import onnx_export

ONNX_PATH = onnx_export.DEFAULT_ONNX_PATH


@pytest.fixture(scope="module")
def model():
    assert ONNX_PATH.is_file(), f"missing {ONNX_PATH}; run export/scripts/export_onnx.py"
    m = onnx.load(str(ONNX_PATH))
    onnx.checker.check_model(m)
    return m


def _shape(value_info):
    return [d.dim_param or d.dim_value for d in value_info.type.tensor_type.shape.dim]


def test_opset_is_at_least_17(model):
    assert max(o.version for o in model.opset_import if o.domain in ("", "ai.onnx")) >= 17


def test_inputs_and_output_interface(model):
    elem = onnx.TensorProto
    inputs = {i.name: (i.type.tensor_type.elem_type, _shape(i)) for i in model.graph.input}
    assert inputs == {
        "x": (elem.FLOAT, ["num_nodes", 6]),
        "edge_index": (elem.INT64, [2, "num_edges"]),
        "edge_attr": (elem.FLOAT, ["num_edges", 2]),
    }
    (out,) = model.graph.output
    assert out.name == "z" and out.type.tensor_type.elem_type == elem.FLOAT and _shape(out) == [1, 201]


def test_parity_on_every_fixture_case(model):
    report = onnx_export.check_parity(ONNX_PATH)
    worst = sorted(report["per_case_max_abs_db"].items(), key=lambda kv: -kv[1])[:3]
    print(f"\nONNX parity: {report['cases']} cases, max |dB error| {report['max_abs_db']:.3e}; worst {worst}")
    assert report["cases"] == len(onnx_export.fixture_cases()) >= 40
    assert report["max_abs_db"] <= onnx_export.PARITY_TOL_DB


def test_handles_every_grid_size_with_one_session(model):
    """Dynamic axes: one session serves all five grids (smallest and largest graphs)."""
    session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    sizes = set()
    for case in onnx_export.fixture_cases():
        inputs = onnx_export.case_inputs(case)
        (z,) = session.run(["z"], inputs)
        assert z.shape == (1, 201) and z.dtype == np.float32 and np.isfinite(z).all()
        sizes.add(inputs["x"].shape[0])
    assert {12 * 12 + 1, 45 * 45 + 1} <= sizes
