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

_None yet._
