#!/usr/bin/env python3
"""Write webapp/public/model/meta.json next to the exported ONNX model (C2.3).

Usage (repository root, export venv):
    export/.venv/Scripts/python.exe export/scripts/export_meta.py [--date YYYY-MM-DD]

Re-run after every ONNX export: meta.json records the ONNX file's SHA-256 and size.
"""
import argparse
import sys

from antenna_export import meta


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", help="export date to record (default: today)")
    args = ap.parse_args(argv)
    path = meta.write_meta(export_date=args.date)
    print(f"wrote {path} ({path.stat().st_size / 1e3:.1f} kB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
