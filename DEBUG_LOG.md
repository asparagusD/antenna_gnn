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
