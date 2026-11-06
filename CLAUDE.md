# CLAUDE.md: working rules for the GraphPatch web app

A zero-cost, client-side web app for the GATv2 antenna surrogate (`src/model.py`).
Work happens on branch `webapp`. Progress lives in `PROGRESS.md`, and failures are logged in `DEBUG_LOG.md`.
Detailed playbooks are in the project skills (created in C0.1); this file holds the rules.

## One-time setup per clone

```bash
git config core.hooksPath .githooks
```

This enables `.githooks/pre-commit`, which rejects any staged path under `webapp_private/`,
any `.pt` / `.pth` / `.npy` file and any file over 10 MB. Every clone must run it once.

## Private data

- `webapp_private/` is **local-only**. It holds the checkpoint, normalisation stats, seed masks,
  splits and reference graphs. It is ignored by `.gitignore` and must never reach GitHub.
- The pre-commit hook must stay enabled (`git config core.hooksPath` → `.githooks`).
- **Never** use `git commit --no-verify` or `git add -f`.
- Before **every** commit, run `git diff --cached --name-only`. It must list nothing under
  `webapp_private/` and no `.pt`, `.pth` or `.npy` files.
- If any such file was **ever** committed (even in a commit later undone): stop, **do not push**,
  tell the user. History rewrites are the user's decision.

## The subchunk loop (every subchunk)

```
PLAN  →  TEST FIRST  →  IMPLEMENT (smallest step)  →  VERIFY  →  COMMIT  →  RECORD
```

1. **Plan:** restate the subchunk goal, list the files to touch, name the acceptance criteria.
   If the plan touches more than ~5 files or ~300 lines, split it into smaller commits.
2. **Test first:** where the behaviour is testable, write the failing test before the code.
3. **Implement:** the smallest change that passes the test. No speculative features.
4. **Verify:** run the subchunk's checks, then the full fast suite (`make check`, defined in C3.1).
   A subchunk is done only when every acceptance criterion is shown passing, with command output.
5. **Commit:** one logical change per commit (protocol below). Never commit failing tests,
   commented-out code or debugging prints.
6. **Record:** tick the subchunk in `PROGRESS.md`; update the repository graph (C0.2) if files
   were added, moved or deleted.

## Commit protocol

- **Small:** one feature, fix or refactor per commit, typically < 200 changed lines
  (excluding lockfiles and generated fixtures).
- **Clear subject:** Conventional Commits, `<type>(<scope>): <summary>`, ≤ 72 chars, imperative.
  Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`, `perf`, `style`.
- **Detailed body** with these sections:
  - **What** changed
  - **Why**
  - **How verified**: the exact commands and their results
  - **Follow-ups**
  - final trailer line `Refs: C<chunk>.<subchunk>`
- **Never:** `git add -A` / `git add .` without reviewing `git status`; commit `webapp_private/`,
  checkpoints, secrets or `node_modules`; force-push `main`; bypass the hook.

## Debugging protocol (every failure)

Every failing test, build error, parity mismatch or visual bug follows six steps, each logged in
`DEBUG_LOG.md` (entry format is in that file's header):

| Step | Action | Output |
|---|---|---|
| 1. Reproduce | Smallest command or test that fails reliably. | exact command + failing output |
| 2. Localise | Bisect data, compare intermediates to the reference, or `git bisect`. | first point where expected ≠ actual |
| 3. Hypothesise | One written, falsifiable hypothesis. | `DEBUG_LOG.md` entry |
| 4. Test it | One targeted check that can prove it wrong. | confirmed / refuted |
| 5. Fix minimally | Change only what the confirmed hypothesis implicates; add a regression test. | diff + test |
| 6. Verify & record | Rerun reproducer, then `make check`; close the log entry; commit as `fix:` with the root cause in the body. | passing output |

**Rules**
- Never weaken a test, raise a tolerance, skip a test or catch-and-ignore an error to make something pass.
- **Three-hypothesis stop rule:** after 3 refuted hypotheses on the same failure, stop and report the log.
- The bundled `/debug` skill may help with runtime/log investigation; the six steps and the log are still required.

Specialised playbooks (detail in the `debug-protocol` skill, created in C0.1):
- **Graph-builder mismatch:** node count → each feature column → sorted edge list → edge attributes; report the first difference with its index.
- **ONNX / ORT mismatch:** layer by layer (input projection → each GATv2 block → pooling → readout) in float64, then float32; check opset, dynamic axes, gather/scatter, softmax over incoming edges.
- **UI bug:** reproduce with a Playwright test or trace; read console and network logs; isolate state vs. rendering.
- **Deployment bug:** base path, `.wasm` / `.onnx` URLs (404s), MIME types, caching, cross-origin isolation.

## Stop conditions: stop and ask the user

- The same failure survives **three** recorded hypotheses.
- A parity tolerance would have to be loosened to pass.
- A step needs a paid service, a credit card or a new external account.
- A domain fact below seems wrong or contradicts the repository.
- Any file from `webapp_private/` (or any checkpoint) was ever committed. Do not push.

## Domain facts

**The repository code is the final authority.** If code and this list disagree, stop and report; do not choose.

- **Grids:** 12, 15, 25, 35, 45 only. **55×55 is excluded.**
- **Output:** |S11| in dB at 201 points, 1–4 GHz (`np.linspace(1, 4, 201)`). The model outputs
  **z-scored** values; convert with `dB = z * s11_std + s11_mean`, using the canonical
  `s11_mean.npy` / `s11_std.npy` (201 values each, in `webapp_private/artifacts/`). Chunk 5 computed
  them on the joint train split of 25/35/45/55 (91,837 antennas, 87% 25×25); later notebooks call them
  the "25×25 statistics". Never recompute them. (Training z-scored with `std + 1e-8`; prediction uses `std`.)
- **Model:** `AntennaGNN(node_feat_dim=6, edge_feat_dim=2, hidden_dim=128, heads=8, edge_dim=16,
  num_blocks=4, output_dim=201)` in `src/model.py`, 587,129 parameters (note: the constructor
  default is `node_feat_dim=5`; always pass 6). Checkpoint **`ch52_bal_ft45_s0.pt`**
  (Chunk 52 final, seed 0), weights under key `model_state`. Its SHA-256 is in
  `webapp_private/artifacts/ch52_runs.csv` (`checkpoint_sha256`); verify it before exporting.
- **Model scope:** on 12/15/35/45, trained only on single-band and non-functioning antennas;
  on 25×25, on the natural data. Chunk 52 test results (balanced test sets; 25×25 natural):

  | Grid | MSE (dB²) | MAE (dB) |
  |---|---|---|
  | 12×12 | 1.936 | 0.495 |
  | 15×15 | 1.692 | 0.454 |
  | 25×25 | 1.426 | 0.393 |
  | 35×35 | 0.988 | 0.314 |
  | 45×45 | 1.087 | 0.310 |

  Predictions for **multi-band** designs are outside what the model learned; the app must flag them.
- **Graph** (frozen builder `build_pyg_graph`, copied verbatim in
  `notebooks/chunk45_replay_finetune_35x35_extra.ipynb` and earlier chunks):
  - **Nodes:** N² pixel nodes plus **one virtual node at index N²**.
  - **Stored node features (5):** metal (0/1); x and y normalised; is_seed (**−1 on the virtual
    node**); distance to the seed centroid divided by N. **Read the exact formulas from the builder.**
  - **Sixth feature:** added by `AppendFeedComponentFeature` in `src/feed_component.py`; marks
    pixels in the feed's **8-connected** metal component, using `feed_rc(N)` with MATLAB rounding.
  - **Edges:** 4-connected pixel edges with `edge_attr = [type, direction]` (type encodes
    metal/air at both ends), plus bidirectional virtual-node edges to **metal pixels only**
    (type 4). Read the exact encoding from the builder.
- **Seed pixels** are always metal in training data. The app must **lock them as metal**.
- **Metal fill:** fraction of all N² pixels that are metal, seeds included. Warn outside **30–80%**.
- **Domain of validity:** the model learned from the generator's random patterns (for 12/15/35/45,
  only single-band and non-functioning antennas). Hand-drawn shapes and multi-band designs may be
  out of distribution, and the app must say so.
- **Functioning:** predicted curve minimum below **−10 dB** (strict `min < −10`). A **band** is a dip
  below −10 dB with ≥ 3 dB prominence and ≥ 150 MHz separation: exactly
  `scipy.signal.find_peaks(-y, height=10, prominence=3, distance=10)`, as used by Chunk 51 to build the
  deployed model's data (and Chunk 46). Endpoints (1 and 4 GHz) are never bands; Chunk 47's extra
  band-edge rule is not used.
