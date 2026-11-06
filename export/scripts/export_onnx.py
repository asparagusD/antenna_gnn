#!/usr/bin/env python3
"""Export the deployed model to webapp/public/model/antenna_gnn.onnx and check parity (C2.1).

Usage (repository root, export venv):
    export/.venv/Scripts/python.exe export/scripts/export_onnx.py [--exporter torchscript|dynamo] [--out PATH]

Exits non-zero unless every fixture case satisfies max |dB_onnx - dB_fixture| <= 1e-4 dB.
"""
import argparse
import sys
from pathlib import Path

from antenna_export import onnx_export


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--exporter", choices=["torchscript", "dynamo"], default="torchscript",
                    help="torchscript (default; dynamo fails on PyG scatter with data-dependent shapes, see DEBUG_LOG.md)")
    ap.add_argument("--out", default=str(onnx_export.DEFAULT_ONNX_PATH))
    args = ap.parse_args(argv)
    path = onnx_export.export(Path(args.out), args.exporter)
    print(f"exported {path} ({path.stat().st_size / 1e6:.2f} MB) with the {args.exporter} exporter")
    report = onnx_export.check_parity(path)
    print(f"opset {report['opset']} | inputs {report['inputs']} | outputs {report['outputs']}")
    worst = sorted(report["per_case_max_abs_db"].items(), key=lambda kv: -kv[1])[:5]
    print(f"parity over {report['cases']} fixture cases: max |dB error| = {report['max_abs_db']:.3e} "
          f"(tolerance {onnx_export.PARITY_TOL_DB:.0e}); worst: " + ", ".join(f"{k} {v:.2e}" for k, v in worst))
    if report["max_abs_db"] > onnx_export.PARITY_TOL_DB:
        print("PARITY FAILED")
        return 1
    print("PARITY OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
