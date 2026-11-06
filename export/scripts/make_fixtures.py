#!/usr/bin/env python3
"""Regenerate the golden fixtures webapp/fixtures/{N}x{N}.json (C1.3).

Usage (from the repository root, with the export venv):
    export/.venv/Scripts/python.exe export/scripts/make_fixtures.py [--out DIR]

Needs the local webapp_private/ data (checkpoint, statistics, seed masks, reference graphs).
The only sanctioned way to change the fixtures; tests/test_fixtures.py checks that regenerating
reproduces the committed files byte for byte.
"""
import argparse
import sys
from pathlib import Path

from antenna_export import fixtures


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(fixtures.DEFAULT_OUT_DIR), help="output directory")
    args = ap.parse_args(argv)
    for path in fixtures.write_all(Path(args.out)):
        print(f"wrote {path} ({path.stat().st_size / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
