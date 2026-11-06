"""Tests for the import edges of build_graph.py (C8.4): TypeScript/JS relative imports and Python
imports inside packages such as export/antenna_export.

Run: `make py-test` (export venv: python -m pytest scripts/repo_graph -q)
"""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("build_graph", Path(__file__).with_name("build_graph.py"))
bg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bg)

FILES = {
    "webapp/src/App.tsx",
    "webapp/src/App.css",
    "webapp/src/core/grid.ts",
    "webapp/src/core/worker.ts",
    "webapp/src/core/infer.ts",
    "webapp/src/model/meta.ts",
    "webapp/src/model/examples.json",
    "webapp/src/components/index.ts",
    "webapp/public/model/meta.json",
    "webapp/fixtures/12x12.json",
    "webapp/fixtures/15x15.json",
    "webapp/fixtures/analysis/band_vectors.json",
    "webapp/vite.config.ts",
    "webapp/vitest.config.ts",
    "export/antenna_export/__init__.py",
    "export/antenna_export/bands.py",
    "export/antenna_export/fixtures.py",
    "export/antenna_export/predict.py",
    "export/scripts/make_fixtures.py",
    "export/tests/test_bands.py",
}


def edges(path, text):
    return sorted(bg.ts_local_imports(path, text, FILES))


def test_ts_static_imports_resolve_extensions_and_kinds():
    text = """
import { create, type Grid } from './core/grid';
import type { ModelMeta } from './model/meta';
import './App.css';
import meta from '../public/model/meta.json';
export { thing } from './components';
import React from 'react';
import font from '@fontsource-variable/public-sans/index.css';
"""
    assert edges("webapp/src/App.tsx", text) == [
        ("webapp/public/model/meta.json", "reads"),
        ("webapp/src/App.css", "imports"),
        ("webapp/src/components/index.ts", "imports"),
        ("webapp/src/core/grid.ts", "imports"),
        ("webapp/src/model/meta.ts", "imports"),
    ]


def test_ts_worker_url_dynamic_import_and_multiline_import():
    text = """
const worker = new Worker(new URL('./core/worker.ts', import.meta.url), { type: 'module' });
const lazy = await import('./core/infer');
import {
  a,
  b,
} from "./model/meta";
const examples = new URL("./model/examples.json", import.meta.url);
"""
    assert edges("webapp/src/App.tsx", text) == [
        ("webapp/src/core/infer.ts", "imports"),
        ("webapp/src/core/worker.ts", "imports"),
        ("webapp/src/model/examples.json", "reads"),
        ("webapp/src/model/meta.ts", "imports"),
    ]


def test_ts_globs_expand_and_templates_and_unknown_paths_are_skipped():
    text = """
const all = import.meta.glob<{ cases: unknown[] }>('../../fixtures/*x*.json', { eager: true });
const one = import.meta.glob('../../fixtures/analysis/band_vectors.json', { eager: true });
const t = new URL(`../fixtures/${N}x${N}.json`, import.meta.url);
import gone from './does-not-exist';
"""
    assert edges("webapp/src/core/grid.ts", text) == [
        ("webapp/fixtures/12x12.json", "reads"),
        ("webapp/fixtures/15x15.json", "reads"),
        ("webapp/fixtures/analysis/band_vectors.json", "reads"),
    ]


def test_ts_vite_query_suffix_is_ignored_and_config_imports_resolve():
    assert edges("webapp/vitest.config.ts", "import viteConfig from './vite.config';") == [
        ("webapp/vite.config.ts", "imports")]
    assert edges("webapp/src/App.tsx", "import w from './core/worker.ts?worker';") == [
        ("webapp/src/core/worker.ts", "imports")]


def test_python_relative_and_package_imports_resolve():
    text = """
from __future__ import annotations
import numpy as np
from . import bands
from .predict import load_model
from model import AntennaGNN
"""
    assert sorted(bg.py_local_imports("export/antenna_export/fixtures.py", text, FILES)) == [
        "export/antenna_export/bands.py",
        "export/antenna_export/predict.py",
    ]


def test_python_absolute_package_imports_resolve_modules_and_names():
    text = """
from antenna_export import bands, fixtures
from antenna_export.predict import load_model
import antenna_export
"""
    assert sorted(bg.py_local_imports("export/scripts/make_fixtures.py", text, FILES)) == [
        "export/antenna_export/__init__.py",
        "export/antenna_export/bands.py",
        "export/antenna_export/fixtures.py",
        "export/antenna_export/predict.py",
    ]
