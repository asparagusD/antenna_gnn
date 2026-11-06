---
name: commit-protocol
description: How to make small, clearly described git commits in this project. Use before every git commit.
---

# Commit protocol

## Before committing
- `git status` and `git diff --staged`: review every staged line. Stage files explicitly (no blind `git add -A`).
- `make check` passes. No failing or skipped tests, no debug prints, no commented-out code.
- Never stage webapp_private/, *.pt, *.pth, *.npy, secrets, node_modules, .impeccable runtime files.
- Run `git diff --cached --name-only` and read the list. Nothing under webapp_private/ may appear.
- The pre-commit hook (.githooks/pre-commit) must stay enabled (`git config core.hooksPath` → .githooks). Never bypass it with --no-verify, and never force-add ignored files with `git add -f`.
- If a private file was ever committed: stop, do not push, tell the user.

## Size
One logical change, usually < 200 changed lines (lockfiles and generated fixtures excluded). If larger, split.

## Message format

    <type>(<scope>): <imperative summary, ≤ 72 chars>

    What: <what changed, in 1–4 bullet points>
    Why: <the reason / the problem solved>
    How verified: <exact commands and their results, e.g. "make check: 142 passed; parity max 3.1e-6 dB over 50 fixtures">
    Follow-ups: <known gaps or "none">

    Refs: C<chunk>.<subchunk>

Types: feat, fix, test, refactor, perf, style, docs, chore, build, ci.
For `fix:` commits, "Why" must state the root cause and reference the DEBUG_LOG.md entry.
