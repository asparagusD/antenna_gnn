# Project tasks. Run from the repository root.
PYTHON ?= python
VENV ?= export/.venv
ifeq ($(OS),Windows_NT)
VENV_PY := $(VENV)/Scripts/python.exe
else
VENV_PY := $(VENV)/bin/python
endif

.PHONY: graph graph-check py-setup py-test

## Regenerate docs/repo_graph/graph.json, then verify it covers every tracked file.
graph:
	$(PYTHON) scripts/repo_graph/build_graph.py
	$(PYTHON) scripts/repo_graph/build_graph.py --check

## Fail if graph.json is stale, misses a tracked file, or has missing/stale summaries.
graph-check:
	$(PYTHON) scripts/repo_graph/build_graph.py --check --strict

## Create export/.venv (Python 3.12, via uv) with the pinned export/ dependencies.
py-setup:
	uv venv $(VENV) --python 3.12
	uv pip install --python $(VENV_PY) -e "export[test]"

## Run the Python reference-pipeline tests (needs the local webapp_private/ data).
py-test:
	cd export && $(abspath $(VENV_PY)) -m pytest
