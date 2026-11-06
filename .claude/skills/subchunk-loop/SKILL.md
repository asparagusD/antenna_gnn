---
name: subchunk-loop
description: The mandatory workflow for every subchunk of the web app build (PLAN, TEST FIRST, IMPLEMENT, VERIFY, COMMIT, RECORD). Use whenever starting, continuing or finishing a subchunk such as C4.2.
---

# Subchunk loop

1. PLAN: restate the goal; list files to touch; list acceptance criteria. If more than ~5 files or ~300 lines, split into several commits and say how.
2. TEST FIRST: write the failing test (unit, parity or Playwright). Run it and show it fails for the right reason.
3. IMPLEMENT: smallest change that passes. No unrelated edits, no speculative features.
4. VERIFY: run the subchunk checks, then `make check` (and `make e2e` for UI work). Paste the command output summary.
5. COMMIT: follow the commit-protocol skill. One logical change per commit.
6. RECORD: tick PROGRESS.md; update the repository graph if files were added/moved/deleted; close any DEBUG_LOG.md entry.

A subchunk is done only when every acceptance criterion is shown passing with command output.
On any failure, switch to the debug-protocol skill.
