#!/usr/bin/env python3
"""Build the repository graph: docs/repo_graph/graph.json.

Nodes are repository files (plus external Drive artifacts that notebooks read or
write); edges are imports / reads / writes / produces / precedes. Import edges cover Python
imports of src/ modules and of repository packages (export/antenna_export), and relative
TypeScript/JavaScript imports in webapp/ (data files such as .json fixtures become reads).

Usage (from the repository root):
    python scripts/repo_graph/build_graph.py                 # regenerate graph.json
    python scripts/repo_graph/build_graph.py --check         # fail on drift / missing nodes
    python scripts/repo_graph/build_graph.py --check --strict  # also fail on missing/stale summaries
    python scripts/repo_graph/build_graph.py --extract DIR   # dump notebook text (code + markdown,
                                                             # trimmed outputs) for reading
    python scripts/repo_graph/build_graph.py --set-summaries FILE.json
                                                             # merge {path: summary} into graph.json

Summaries are written by a person (or an agent) who has read the file; this script
never invents them. It preserves them across regenerations and records the content
hash they were written against (`summary_sha`), so stale summaries are detectable.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GRAPH_PATH = "docs/repo_graph/graph.json"
SELF_REFERENTIAL = {GRAPH_PATH}  # size/sha would change every time it is written

EXCLUDED_SEGMENTS = {".git", "node_modules", "webapp_private", "__pycache__", ".ipynb_checkpoints"}
# .impeccable/: keep only the shared artifacts its README says belong in the repo.
IMPECCABLE_SHARED = re.compile(r"(^|/)\.impeccable/(config\.json|live/config\.json|design\.json|surfaces/.+\.md|critique/.+\.md)$")

OUTPUT_TRIM = 600  # characters of each text output kept by --extract

# Calls whose first string-literal argument is a file path.
READ_CALLS = r"READ|np\.load|json\.load|torch\.load|pd\.read_csv|pd\.read_parquet"
WRITE_CALLS = r"OUT|COUT|torch\.save|np\.save"
STR_ARG = r"""\(\s*(?:open\(\s*)?(?:READ\(\s*)?(f?)(['"])(.+?)\2"""
READ_RE = re.compile(rf"(?<![\w.])(?:{READ_CALLS}){STR_ARG}")
WRITE_RE = re.compile(rf"(?<![\w.])(?:{WRITE_CALLS}){STR_ARG}")
# torch.save(obj, 'path') / np.save('path', arr): the path may be the 2nd argument.
TORCH_SAVE_2ND = re.compile(r"""(?<![\w.])torch\.save\([^,()]+,\s*(f?)(['"])(.+?)\2""")
NB_IMPORT_RE = re.compile(r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", re.M)
CHUNK_RE = re.compile(r"chunk(\d+)([a-z]?)")
ARTIFACT_CHUNK_RE = re.compile(r"^ch(\d+)")


# ---------------------------------------------------------------- file listing

def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True,
                          text=True, encoding="utf-8").stdout


def excluded(path: str) -> bool:
    parts = path.split("/")
    if EXCLUDED_SEGMENTS.intersection(parts):
        return True
    if ".impeccable" in parts and not IMPECCABLE_SHARED.search(path):
        return True
    return False


def list_files() -> list[str]:
    """Tracked files plus untracked files not ignored by .gitignore."""
    out = git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
    paths = {p for p in out.split("\0") if p}
    return sorted(p for p in paths if not excluded(p) and (ROOT / p).is_file())


def tracked_files() -> set[str]:
    out = git("ls-files", "-z", "--cached")
    return {p for p in out.split("\0") if p and not excluded(p)}


# ---------------------------------------------------------------- per-file facts

def normalised_bytes(path: str) -> bytes:
    """Content as git stores it (LF), so Windows and Linux checkouts agree."""
    data = (ROOT / path).read_bytes()
    if b"\0" in data:
        return data
    return data.replace(b"\r\n", b"\n")


def blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def file_type(path: str) -> str:
    p = Path(path)
    if path.startswith(".claude/skills/"):
        return "skill"
    if path.startswith(".claude/agents/"):
        return "agent"
    if path.startswith(".githooks/"):
        return "hook"
    return {
        ".py": "python", ".ipynb": "notebook", ".md": "markdown", ".json": "json",
        ".js": "javascript", ".ts": "typescript", ".tsx": "typescript", ".sh": "shell",
        ".cmd": "shell", ".txt": "text", ".csv": "data", ".yml": "config", ".yaml": "config",
        ".toml": "config",
    }.get(p.suffix.lower(), "config" if p.name.startswith(".") or p.name == "Makefile" else "other")


def chunk_of(path: str) -> tuple[int | None, str | None]:
    if not path.endswith(".ipynb"):
        return None, None
    m = CHUNK_RE.search(Path(path).name)
    if not m:
        return None, None
    return int(m.group(1)), f"{int(m.group(1))}{m.group(2)}"


def artifact_name(literal: str) -> str | None:
    """Basename of a path literal, with f-string placeholders collapsed, e.g. "seed_mask_{}.npy"."""
    name = literal.replace("\\", "/").rstrip("/").split("/")[-1].strip()
    if "." not in re.sub(r"\{[^}]*\}", "X", name):
        return None  # no extension: a directory, not a file
    return re.sub(r"\{[^}]*\}+", "{}", name)  # 'sample_{idx}.pt' == 'sample_{i}.pt'


def path_literals(regex: re.Pattern, text: str) -> list[str]:
    names = []
    for m in regex.finditer(text):
        name = artifact_name(m.group(3))
        if name:
            names.append(name)
    return names


def python_facts(text: str, src_modules: set[str]) -> dict:
    facts: dict = {"imports": [], "functions": [], "classes": []}
    try:
        tree = ast.parse(text)
    except SyntaxError as e:  # keep going; record the problem
        facts["parse_error"] = str(e)
        return facts
    imports = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            imports.add(node.module)
        elif isinstance(node, ast.ImportFrom) and node.level > 0:
            imports.add("." * node.level + (node.module or ""))
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            facts["functions"].append(node.name)
        elif isinstance(node, ast.ClassDef):
            facts["classes"].append(node.name)
    facts["imports"] = sorted(imports)
    facts["src_imports"] = sorted(local_module(m, src_modules) for m in imports
                                  if local_module(m, src_modules))
    return facts


def local_module(module: str, src_modules: set[str]) -> str | None:
    """Map 'model', 'src.model', '.model' to 'src/model.py' when it is a src module."""
    name = module.lstrip(".")
    if name.startswith("src."):
        name = name[4:]
    head = name.split(".")[0]
    return f"src/{head}.py" if head in src_modules else None


# ---------------------------------------------------------------- local imports (C8.4)

TS_SUFFIXES = (".ts", ".tsx", ".js", ".mjs", ".cjs")
TS_RESOLVE = ("", ".ts", ".tsx", ".js", ".mjs", ".json", ".css", "/index.ts", "/index.tsx", "/index.js")
DATA_SUFFIXES = (".json", ".onnx", ".wasm", ".csv")
# Literal specifiers only (template literals are skipped): static import/export-from, side-effect
# import, dynamic import(), new URL('...', import.meta.url) (workers, fixtures), Vite import.meta.glob.
TS_IMPORT_RES = [
    re.compile(r"""(?:^|[;\s])(?:import|export)\s+(?:type\s+)?[^;'"`]*?\sfrom\s*(['"])(.+?)\1""", re.S),
    re.compile(r"""(?:^|[;\s])import\s*(['"])(.+?)\1"""),
    re.compile(r"""(?<![\w.])import\(\s*(['"])(.+?)\1"""),
    re.compile(r"""new\s+URL\(\s*(['"])(.+?)\1\s*,\s*import\.meta\.url"""),
    re.compile(r"""import\.meta\.glob\s*(?:<.*?>)?\s*\(\s*(['"])(.+?)\1"""),
]


def _norm(path: str) -> str:
    parts: list[str] = []
    for part in path.split("/"):
        if part == "..":
            if parts:
                parts.pop()
        elif part not in ("", "."):
            parts.append(part)
    return "/".join(parts)


def ts_local_imports(path: str, text: str, files: set[str]) -> set[tuple[str, str]]:
    """(target, kind) for every relative specifier in a TS/JS file that resolves to a repository file.
    kind is "reads" for data files (.json, .onnx, ...) and "imports" otherwise."""
    base = path.rsplit("/", 1)[0] if "/" in path else ""
    found: set[tuple[str, str]] = set()
    for regex in TS_IMPORT_RES:
        for m in regex.finditer(text):
            spec = m.group(2).split("?", 1)[0]
            if not spec.startswith(("./", "../")):
                continue
            joined = _norm(f"{base}/{spec}")
            if "*" in spec:
                pattern = re.compile("^" + ".*?".join("[^/]*".join(map(re.escape, seg.split("*")))
                                                      for seg in joined.split("**")) + "$")
                targets = [f for f in files if pattern.match(f)]
            else:
                targets = [joined + ext for ext in TS_RESOLVE if joined + ext in files][:1]
            for target in targets:
                if target != path:
                    found.add((target, "reads" if target.endswith(DATA_SUFFIXES) else "imports"))
    return found


def py_local_imports(path: str, text: str, files: set[str]) -> set[str]:
    """Repository modules a Python file imports: relative imports, and absolute imports of packages
    that live in the repository (e.g. antenna_export under export/). src/ modules imported by bare
    name are handled by local_module()."""
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return set()
    roots = sorted({p.rsplit("/", 2)[0] + "/" if p.count("/") >= 2 else ""
                    for p in files if p.endswith("/__init__.py")})
    here = path.rsplit("/", 1)[0] if "/" in path else ""

    def resolve(module: str, level: int) -> str | None:
        rel = module.replace(".", "/")
        if level:
            base = here
            for _ in range(level - 1):
                base = base.rsplit("/", 1)[0] if "/" in base else ""
            candidates = [_norm(f"{base}/{rel}")] if rel else [base]
        else:
            candidates = [root + rel for root in roots]
        for c in candidates:
            for target in (f"{c}.py", f"{c}/__init__.py"):
                if target in files:
                    return target
        return None

    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                target = resolve(alias.name, 0)
                if target:
                    found.add(target)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            submodules = [resolve(f"{module}.{a.name}" if module else a.name, node.level) for a in node.names]
            found.update(t for t in submodules if t)
            if not all(submodules):
                target = resolve(module, node.level)
                if target:
                    found.add(target)
    found.discard(path)
    return found


def notebook_cells(path: str) -> list[dict]:
    nb = json.loads(normalised_bytes(path).decode("utf-8"))
    return nb.get("cells", [])


def cell_source(cell: dict) -> str:
    src = cell.get("source", "")
    return "".join(src) if isinstance(src, list) else src


def notebook_facts(path: str, src_modules: set[str]) -> dict:
    cells = notebook_cells(path)
    code = "\n".join(cell_source(c) for c in cells if c.get("cell_type") == "code")
    imports = set()
    for m in NB_IMPORT_RE.finditer(code):
        imports.add(m.group(1) or m.group(2))
    writes = path_literals(WRITE_RE, code) + path_literals(TORCH_SAVE_2ND, code)
    return {
        "cells": len(cells),
        "code_cells": sum(c.get("cell_type") == "code" for c in cells),
        "src_imports": sorted({local_module(m, src_modules) for m in imports} - {None}),
        "reads": sorted(set(path_literals(READ_RE, code))),
        "writes": sorted(set(writes)),
    }


def notebook_text(path: str) -> str:
    """Code and markdown in order, with text outputs trimmed (images dropped)."""
    parts = []
    for i, cell in enumerate(notebook_cells(path)):
        kind = cell.get("cell_type")
        parts.append(f"\n# ---- [{i}] {kind} ----\n{cell_source(cell)}")
        if kind != "code":
            continue
        for out in cell.get("outputs", []):
            text = out.get("text") or out.get("data", {}).get("text/plain") or out.get("evalue")
            if not text:
                continue
            text = "".join(text) if isinstance(text, list) else str(text)
            if len(text) > OUTPUT_TRIM:
                text = text[:OUTPUT_TRIM] + f" ...[{len(text) - OUTPUT_TRIM} chars trimmed]"
            parts.append(f"# >> output:\n{text}")
    return "\n".join(parts)


# ---------------------------------------------------------------- graph

def build(previous: dict | None) -> dict:
    files = list_files()
    fileset = set(files)
    src_modules = {Path(p).stem for p in files if p.startswith("src/") and p.endswith(".py")}
    old = {n["path"]: n for n in (previous or {}).get("nodes", [])}

    nodes: dict[str, dict] = {}
    edges: set[tuple[str, str, str]] = set()
    artifacts: dict[str, dict] = {}

    def artifact(name: str, chunk: int | None) -> str:
        key = f"artifact:{name}"
        node = artifacts.setdefault(key, {"path": key, "type": "artifact", "size": None,
                                          "chunk": None, "external": True})
        m = ARTIFACT_CHUNK_RE.match(name)
        if m:
            node["chunk"] = int(m.group(1))
        elif chunk is not None and (node["chunk"] is None or chunk < node["chunk"]):
            node["chunk"] = chunk  # first notebook that writes it
        return key

    for path in files:
        chunk, label = chunk_of(path)
        node: dict = {"path": path, "type": file_type(path), "size": None, "chunk": chunk}
        if label and label != str(chunk):
            node["chunk_label"] = label
        if path not in SELF_REFERENTIAL:
            data = normalised_bytes(path)
            node["size"] = len(data)
            node["sha"] = blob_sha(data)
        if path.endswith(".py"):
            text = normalised_bytes(path).decode("utf-8", errors="replace")
            facts = python_facts(text, src_modules)
            facts["reads"] = sorted(set(path_literals(READ_RE, text)))
            facts["writes"] = sorted(set(path_literals(WRITE_RE, text) + path_literals(TORCH_SAVE_2ND, text)))
            node.update(facts)
        elif path.endswith(".ipynb"):
            node.update(notebook_facts(path, src_modules))

        for target in node.get("src_imports", []):
            if target != path:
                edges.add((path, target, "imports"))
        if path.endswith(".py"):
            for target in py_local_imports(path, text, fileset):
                edges.add((path, target, "imports"))
        elif path.endswith(TS_SUFFIXES):
            text = normalised_bytes(path).decode("utf-8", errors="replace")
            for target, kind in ts_local_imports(path, text, fileset):
                edges.add((path, target, kind))
        for name in node.get("reads", []):
            edges.add((path, artifact(name, None), "reads"))
        for name in node.get("writes", []):
            kind = "produces" if re.search(r"\.(pt|pth|onnx)$", name) else "writes"
            edges.add((path, artifact(name, chunk), kind))

        prev = old.get(path, {})
        node["summary"] = prev.get("summary", "")
        node["summary_sha"] = prev.get("summary_sha")
        nodes[path] = node

    for key, node in artifacts.items():
        prev = old.get(key, {})
        node["summary"] = prev.get("summary", "")
        node["summary_sha"] = None
        nodes[key] = node

    # precedes: numbered notebooks in chunk order (suffix letters sort after the number)
    numbered = sorted((p for p in files if chunk_of(p)[0] is not None),
                      key=lambda p: (chunk_of(p)[0], chunk_of(p)[1], p))
    for a, b in zip(numbered, numbered[1:]):
        edges.add((a, b, "precedes"))

    return {
        "schema": "antenna_gnn.repo_graph/v1",
        "generator": "scripts/repo_graph/build_graph.py",
        "edge_kinds": ["imports", "reads", "writes", "produces", "precedes"],
        "nodes": [nodes[k] for k in sorted(nodes)],
        "edges": [{"source": s, "target": t, "kind": k} for s, t, k in sorted(edges)],
    }


def dumps(graph: dict) -> str:
    return json.dumps(graph, indent=1, ensure_ascii=False) + "\n"


def load_existing() -> dict | None:
    p = ROOT / GRAPH_PATH
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def summary_problems(graph: dict) -> tuple[list[str], list[str]]:
    missing, stale = [], []
    for n in graph["nodes"]:
        if n["type"] == "artifact":
            continue
        if not n.get("summary"):
            missing.append(n["path"])
        elif n.get("sha") and n.get("summary_sha") != n["sha"]:
            stale.append(n["path"])
    return missing, stale


def check(strict: bool) -> int:
    existing = load_existing()
    if existing is None:
        print(f"graph check: FAIL: {GRAPH_PATH} does not exist; run `make graph`.")
        return 1
    fresh = build(existing)
    ok = True

    in_graph = {n["path"] for n in existing["nodes"]}
    missing_nodes = sorted(tracked_files() - in_graph)
    if missing_nodes:
        ok = False
        print(f"graph check: FAIL: {len(missing_nodes)} tracked file(s) missing from the graph:")
        for p in missing_nodes:
            print(f"  - {p}")

    if dumps(fresh) != dumps(existing):
        ok = False
        old_nodes = {n["path"]: n for n in existing["nodes"]}
        new_nodes = {n["path"]: n for n in fresh["nodes"]}
        print("graph check: FAIL: graph.json is out of date (run `make graph`). Differences:")
        for p in sorted(set(old_nodes) | set(new_nodes)):
            if p not in new_nodes:
                print(f"  - removed: {p}")
            elif p not in old_nodes:
                print(f"  + added:   {p}")
            elif old_nodes[p] != new_nodes[p]:
                keys = sorted(k for k in set(old_nodes[p]) | set(new_nodes[p])
                              if old_nodes[p].get(k) != new_nodes[p].get(k))
                print(f"  ~ changed: {p} ({', '.join(keys)})")
        if existing["edges"] != fresh["edges"]:
            print("  ~ edges differ")

    missing, stale = summary_problems(existing)
    if missing or stale:
        label = "FAIL" if strict else "warning"
        print(f"graph check: {label}: {len(missing)} node(s) without a summary, "
              f"{len(stale)} with a stale summary (file changed since it was written).")
        for p in missing[:20]:
            print(f"  ? no summary: {p}")
        for p in stale[:20]:
            print(f"  ! stale:      {p}")
        if strict:
            ok = False

    if ok:
        print(f"graph check: OK ({len(existing['nodes'])} nodes, {len(existing['edges'])} edges)")
    return 0 if ok else 1


def write(graph: dict) -> None:
    out = ROOT / GRAPH_PATH
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(dumps(graph))


def set_summaries(source: str) -> int:
    summaries = json.loads(Path(source).read_text(encoding="utf-8"))
    graph = build(load_existing())
    by_path = {n["path"]: n for n in graph["nodes"]}
    unknown = sorted(set(summaries) - set(by_path))
    if unknown:
        print("set-summaries: FAIL: not in the graph:", *unknown, sep="\n  ")
        return 1
    for path, text in summaries.items():
        node = by_path[path]
        node["summary"] = " ".join(str(text).split())
        node["summary_sha"] = node.get("sha")
    write(graph)
    print(f"set-summaries: wrote {len(summaries)} summaries to {GRAPH_PATH}")
    return 0


def extract(directory: str) -> int:
    out = Path(directory)
    out.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in list_files():
        if path.endswith(".ipynb"):
            (out / (Path(path).stem + ".txt")).write_text(notebook_text(path), encoding="utf-8")
            count += 1
    print(f"extract: wrote {count} notebook text files to {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="fail if graph.json is stale or misses a tracked file")
    ap.add_argument("--strict", action="store_true", help="with --check: also fail on missing/stale summaries")
    ap.add_argument("--extract", metavar="DIR", help="write notebook text dumps to DIR")
    ap.add_argument("--set-summaries", metavar="FILE", help="merge a {path: summary} JSON file")
    args = ap.parse_args(argv)

    if args.extract:
        return extract(args.extract)
    if args.set_summaries:
        return set_summaries(args.set_summaries)
    if args.check:
        return check(args.strict)
    graph = build(load_existing())
    write(graph)
    missing, stale = summary_problems(graph)
    print(f"graph: wrote {GRAPH_PATH} ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges; "
          f"{len(missing)} without summary, {len(stale)} stale)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
