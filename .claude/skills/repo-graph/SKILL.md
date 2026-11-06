---
name: repo-graph
description: Build, read and update the repository graph (docs/repo_graph/graph.json and REPO_MAP.md). Use at the start of any task to orient in the codebase, after adding/moving/deleting files, and when asked where something lives or what depends on what.
---

# Repository graph

The graph is the project's map. Read it before searching the codebase; update it after structural changes.

## Files
- `docs/repo_graph/graph.json`: nodes {path, type, size, chunk, summary}; edges {source, target, kind}.
  Edge kinds: imports, reads, writes, produces, precedes (notebook chunk order).
- `docs/repo_graph/REPO_MAP.md`: Mermaid diagrams (model lineage, module dependencies, web app data flow) and the notebook table.
- `scripts/repo_graph/build_graph.py`: extraction script. `make graph` regenerates and fails on drift.

## When orienting
1. Read REPO_MAP.md, then query graph.json for the files relevant to the task.
2. Open the actual files before relying on a summary; summaries can be stale.

## When updating
1. Run `make graph`.
2. For every new or changed file, write or refresh its summary by reading the file (never generate summaries from the filename).
3. Update the Mermaid diagrams if lineage or data flow changed.
4. Commit as `docs(graph): ...` with the files listed in the body.

## Rules
- Every tracked file must be a node. `make graph` fails otherwise.
- Never include webapp_private/, node_modules/ or caches.
