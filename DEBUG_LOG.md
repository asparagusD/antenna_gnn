# DEBUG_LOG

Every failing test, build error, parity mismatch or visual bug gets an entry here, following the
six-step debugging protocol in `CLAUDE.md`. Newest entries go at the top. After **3 refuted
hypotheses** on the same failure, stop and report this log to the user.

## Entry format

```markdown
### YYYY-MM-DD: C<chunk>.<subchunk>: <one-line symptom>

- **Status:** open | closed | escalated (3 hypotheses refuted)
- **Symptom:** what failed, as observed.
- **Reproducer:** the exact command or test, and its failing output (trimmed).
- **Localised to:** the first place where expected and actual diverge (index, layer, file:line).
- **Hypotheses:**
  1. <falsifiable statement>. Check: <targeted test>. **confirmed | refuted**
  2. ...
  3. ...
- **Root cause:** the confirmed explanation.
- **Fix:** <commit hash>, `fix(...)` subject; regression test: <path::name>.
- **Verification:** reproducer now passes; `make check` output summary.
```

## Entries

### 2026-11-06: C5.3: new chart and client tests fail on test-side mistakes

- **Status:** closed (two test-code mistakes; product code unchanged by either fix)
- **Symptom:** (a) `tsc -b` rejected `predictClient.test.ts`: `FakeWorker.postMessage(message: WorkerRequest)` is not
  assignable to `WorkerLike.postMessage(message: unknown, …)`. (b) The new −10 dB label test failed:
  `expected 'end' to be 'start'`.
- **Reproducer:** (a) `cd webapp && npx tsc -b --noEmit`; (b) `npx vitest run src/components/S11Chart.test.tsx`.
- **Localised to:** (a) the fake's parameter type (method parameters are checked contravariantly under
  `strictFunctionTypes` for property-style members); (b) the fixture `dip(-0.3, 190)`, which lies *above* the
  helper's −2 dB baseline, so it is a bump and the minimum is at 1 GHz, not 3.85 GHz.
- **Hypotheses:**
  1. (a) Narrowing the parameter in the fake breaks assignability; typing it `unknown` and casting inside
     fixes it without touching `WorkerLike`. Check: change and rerun tsc. **confirmed** (clean).
  2. (b) The fixture, not the placement code, is wrong: with a dip deeper than the baseline the minimum is at
     3.85 GHz and the label goes left. Check: use `dip(-3, 190)` and rerun. **confirmed** (7 passed).
- **Root cause:** test-code mistakes while writing tests first.
- **Fix:** (a) in `9d1b8ce` (feat(core) client); (b) in `af48de3` (style(ui) −10 dB label). Regression tests: the
  same files.
- **Verification:** `make check`: vitest 679, pytest 267 passed; `make e2e`: 14 passed.

### 2026-11-06: C5.2: new FillMeter tests find the warning text several times

- **Status:** closed (test-harness bug in the new test file; component unchanged)
- **Symptom:** after implementing FillMeter, 7 of 19 tests in the new `FillMeter.test.tsx` failed.
- **Reproducer:** `cd webapp && npx vitest run src/components/FillMeter.test.tsx` →
  `TestingLibraryElementError: Found multiple elements with the text: Outside the 30–80% range …`.
- **Localised to:** the second and later `it.each` cases: each found the warnings of all earlier renders in
  `document.body`.
- **Hypotheses:**
  1. Earlier renders stay mounted because Testing Library's automatic `afterEach(cleanup)` is registered
     only when the test runner exposes globals, and this Vitest config runs without globals. Check: add
     `afterEach(cleanup)` to the file and rerun; nothing else changes. **confirmed** (19 passed).
- **Root cause:** no cleanup between renders in a new test file (the earlier App test renders once per test
  and never queried across renders, so it never showed).
- **Fix:** included in the C5.2 feature commits (`afterEach(cleanup)` in `FillMeter.test.tsx` and
  `GridSizeSelector.test.tsx`); no component change. Regression: the same files, which now fail if cleanup is
  removed.
- **Verification:** `npx vitest run src/components/FillMeter.test.tsx`: 19 passed; `make check`: vitest 637,
  pytest 267 passed.

### 2026-11-06: C2.1: dynamo ONNX exporter fails on PyG scatter (data-dependent shape)

- **Status:** closed (exporter choice; model unchanged, no patch)
- **Symptom:** `torch.onnx.export(..., dynamo=True)` (torch 2.15.0, torch_geometric 2.8.1) fails in step 1/3
  (`torch.export.export`, both strict=False and strict=True).
- **Reproducer:** `PYTHONIOENCODING=utf-8 export/.venv/Scripts/python.exe export/scripts/export_onnx.py --exporter dynamo`
  → `GuardOnDataDependentSymNode: Could not guard on data-dependent expression u8 > 0 ... Caused by:
  (torch_geometric\utils\_scatter.py:48 in scatter)`. (Without PYTHONIOENCODING the real error is hidden by a
  cp1252 `UnicodeEncodeError` while torch.onnx prints its progress marks.)
- **Localised to:** PyG `scatter`, where a branch depends on a size produced by data-dependent ops (the boolean
  metal / virtual-node masks and self-loop handling in GATv2Conv), which torch.export cannot guard on.
- **Hypotheses:**
  1. The failure is specific to torch.export's symbolic tracing of data-dependent sizes; the TorchScript
     exporter, which traces with concrete shapes and emits dynamic ONNX ops, exports the same unmodified model.
     Check: `--exporter torchscript`, then onnxruntime parity on all 48 fixture cases. **confirmed**
     (export succeeds; max |dB error| 2.494e-05 ≤ 1e-4).
- **Root cause:** dynamo/torch.export does not support PyG's data-dependent scatter sizes here.
- **Fix:** C2.1 feat commit: export_onnx.py defaults to `--exporter torchscript` (dynamo kept as an option to
  reproduce this). The model and PyG are not modified; only the exported output's declared shape is set to
  [1, 201] (the exporter labelled the batch axis symbolically).
- **Verification:** tests/test_onnx.py (interface, opset 18, parity on every fixture, all grids in one session).
- **Notes:** the TorchScript exporter is deprecated upstream (FutureWarning), so the torch pin matters; onnxruntime
  logs harmless `VerifyOutputSizes` warnings (declared `{-1}` vs actual `{E, 8}` on an intermediate attention
  tensor) — watch for them in onnxruntime-web (C4.3).

### 2026-11-06: C1.3: fixtures check out with CRLF on Windows clones

- **Status:** closed
- **Symptom:** a fresh clone with core.autocrlf=true gets `webapp/fixtures/*.json` with CRLF line endings,
  while make_fixtures.py writes LF, so test_regenerating_reproduces_committed_files_exactly would fail there.
- **Reproducer:** `git -c core.autocrlf=true clone -q . /tmp/c && git -C /tmp/c ls-files --eol webapp/fixtures/12x12.json`
  → `i/lf w/crlf`.
- **Localised to:** checkout conversion (no .gitattributes rule for the fixtures); the committed blobs are LF.
- **Hypotheses:**
  1. Without an eol rule, autocrlf converts the fixtures on checkout; `text eol=lf` keeps them LF.
     Check: add the rule and re-clone. **confirmed** (`w/lf`).
- **Root cause:** missing .gitattributes rule for byte-compared generated files.
- **Fix:** fix(git) commit after 572c625; `.gitattributes`: `webapp/fixtures/*.json text eol=lf`.
- **Verification:** fresh autocrlf clone shows `i/lf w/lf`; export suite passes.

### 2026-11-06: C1.3: random-fixture fill test fails at 25x25, fill 0.30

- **Status:** closed
- **Symptom:** `test_random_cases_hit_their_target_fill` failed: `assert 0.3008 == 0.3 ± 8.0e-04`.
- **Reproducer:** `cd export && .venv/Scripts/python.exe -m pytest tests/test_fixtures.py::test_random_cases_hit_their_target_fill`
  → `E assert 0.3008 == 0.3 ± 8.0e-04` (1 failed).
- **Localised to:** the 25x25 `rand-fill30` case; target count 0.30 · 625 = 187.5 pixels, generated 188.
- **Hypotheses:**
  1. Half-pixel targets round (Python `round`, half to even, or the float just below .5) to a count
     whose fill differs from the target by exactly 0.5/N², and `pytest.approx(abs=0.5/N²)` fails on
     floating-point error at that boundary; the generator is correct. Check: list every random case with
     |fill − target| ≥ 0.5/N² − 1e-12 and compare its metal count with `round(target·N²)`. **confirmed**
     (8 cases, all half-pixel targets at 15/25/35/45, every count equals `round(target·N²)`).
- **Root cause:** test compared floats exactly at the theoretical bound; no generator bug.
- **Fix:** C1.3 feat(fixtures) commit; the test now asserts the exact integer count `round(target·N²)` and
  the bound `≤ 0.5/N² + 1e-12` (tests/test_fixtures.py::test_random_cases_hit_their_target_fill).
- **Verification:** reproducer passes; full export suite passes (`make check` does not exist yet, C3.1).
