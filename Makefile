# Project tasks. Run from the repository root.
PYTHON ?= python

.PHONY: graph graph-check

## Regenerate docs/repo_graph/graph.json, then verify it covers every tracked file.
graph:
	$(PYTHON) scripts/repo_graph/build_graph.py
	$(PYTHON) scripts/repo_graph/build_graph.py --check

## Fail if graph.json is stale, misses a tracked file, or has missing/stale summaries.
graph-check:
	$(PYTHON) scripts/repo_graph/build_graph.py --check --strict
