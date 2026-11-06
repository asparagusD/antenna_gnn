# Project tasks. Run from the repository root.
PYTHON ?= python
VENV ?= export/.venv
WEB := webapp
ifeq ($(OS),Windows_NT)
VENV_PY := $(VENV)/Scripts/python.exe
else
VENV_PY := $(VENV)/bin/python
endif

.PHONY: check typecheck lint vitest e2e graph graph-check py-setup py-test web-setup

## Fast quality gate (< 2 min): TypeScript typecheck, ESLint, Vitest, Python reference tests.
check: typecheck lint vitest py-test

typecheck:
	cd $(WEB) && npm run typecheck

lint:
	cd $(WEB) && npm run lint

vitest:
	cd $(WEB) && npm test

## End-to-end tests (Playwright, Chromium) against the production build.
e2e:
	cd $(WEB) && npm run e2e

## Regenerate docs/repo_graph/graph.json and fail on drift (missing nodes, missing or stale summaries).
graph:
	$(PYTHON) scripts/repo_graph/build_graph.py
	$(PYTHON) scripts/repo_graph/build_graph.py --check --strict

## Check graph.json without rewriting it (same strict rules).
graph-check:
	$(PYTHON) scripts/repo_graph/build_graph.py --check --strict

## Install the pinned web dependencies and Playwright's Chromium.
web-setup:
	cd $(WEB) && npm ci && npx playwright install chromium

## Create export/.venv (Python 3.12, via uv) with the pinned export/ dependencies.
py-setup:
	uv venv $(VENV) --python 3.12
	uv pip install --python $(VENV_PY) -e "export[test]"

## Python reference-pipeline tests (needs the local webapp_private/ data).
py-test:
	cd export && $(abspath $(VENV_PY)) -m pytest
