# Project tasks. Run from the repository root.
PYTHON ?= python
VENV ?= export/.venv
WEB := webapp
ifeq ($(OS),Windows_NT)
VENV_PY := $(VENV)/Scripts/python.exe
else
VENV_PY := $(VENV)/bin/python
endif
# Impeccable design detector (bundled, checksum-verified launcher; the npm package of that name is the
# retired 3.x CLI, so `npx impeccable` is not used).
ifeq ($(OS),Windows_NT)
IMPECCABLE ?= .claude\skills\impeccable\scripts\impeccable.cmd
else
IMPECCABLE ?= .claude/skills/impeccable/scripts/impeccable
endif

.PHONY: check check-web typecheck lint vitest design-check e2e graph graph-check py-setup py-test web-setup

## Fast quality gate (< 2 min): TypeScript typecheck, ESLint, Vitest, the Impeccable design detector on
## the web app source, Python reference tests.
check: check-web py-test

## The web part of `make check`, used by CI (no torch): typecheck, lint, Vitest (including the ONNX parity
## tests against the committed fixtures in webapp/tests/node), the design detector.
check-web: typecheck lint vitest design-check

typecheck:
	cd $(WEB) && npm run typecheck

lint:
	cd $(WEB) && npm run lint

vitest:
	cd $(WEB) && npm test

## Impeccable design detector on webapp/src (exit 2 = findings; justify any exception in docs/design_review.md).
design-check:
	$(IMPECCABLE) detect webapp/src

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

## Python reference-pipeline tests (needs the local webapp_private/ data), then the repository-graph
## builder's tests (no private data needed).
py-test:
	cd export && $(abspath $(VENV_PY)) -m pytest
	$(VENV_PY) -m pytest scripts/repo_graph -q -p no:cacheprovider
