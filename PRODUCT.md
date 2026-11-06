# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Antenna and RF researchers** exploring pixelated microstrip patch designs who want an instant |S11| estimate before (or instead of) a full-wave simulation.
- **Students** learning how metal geometry shapes a patch antenna's resonance.
- **Reviewers of the project's IEEE paper** (under review) checking what the model does, where it is valid, and how accurate it is.

All are technically literate. They use it mostly on desktop, sometimes on tablets. The job: paint or load a metal pattern on an N×N grid, see the predicted reflection spectrum immediately, read whether the antenna functions and where it resonates, and understand how far to trust the prediction.

## Product Purpose

GraphPatch predicts the reflection spectrum |S11| (201 points, 1–4 GHz) of a pixelated microstrip patch antenna from a hand-painted metal pattern, instantly and entirely in the browser. It replaces a full-wave EM simulation (minutes to hours) with a forward pass of a graph neural network (milliseconds) for quick exploration. Success: a user edits a pattern and sees a trustworthy curve, functioning verdict and band position update live, and always knows whether the design is inside the model's domain of validity.

## Positioning

One 587,129-parameter GATv2 graph neural network covers five pixel resolutions (12×12, 15×15, 25×25, 35×35, 45×45), whereas grid-based CNN baselines need a separate, much larger model per grid. It runs client-side with no server, so predictions are instant, private and work offline. Its scope is stated honestly: it is a **single-band design tool**, trained on single-band and non-functioning antennas (12/15/35/45) and on the natural data (25×25).

## Operating Context

- Used alongside full-wave simulators and the paper: exploration and intuition here, verification in simulation.
- Patterns follow the MATLAB generator `alternate.m` (V3.1.1): a fixed block of seed pixels around the feed is always metal; the feed pixel is part of it.
- A design "functions" when the predicted minimum is below −10 dB; a band is a dip ≤ −10 dB with ≥ 3 dB prominence, ≥ 150 MHz from the next (Chunk 51 rule).
- The model and assets are static files (`webapp/public/model/antenna_gnn.onnx`, `meta.json`); inference uses onnxruntime-web.

## Capabilities and Constraints

- **Core screen:** pixel grid editor; live S11 plot; compact results panel (functioning verdict, band frequency, minimum |S11|); grid-size selector (12, 15, 25, 35, 45; 55×55 excluded); metal-fill meter (fraction of all N² pixels, seeds included) warning outside 30–80%; a domain-of-validity note; a calm "outside the model's scope" notice whenever the predicted curve shows more than one band.
- **Seed pixels are locked as metal** in the editor (every training antenna has them).
- **Static site, no backend**; must work **offline after first load**; fast on mid-range laptops; dark and light themes.
- **Out-of-distribution designs:** hand-drawn shapes and multi-band designs may lie outside what the model learned; the app must say so without alarm. The model was never observed to predict a second band (C1.3), so multi-band handling is tested with synthetic curves.
- **Numerical contract:** the browser must reproduce the Python reference within 1e-4 dB on the golden fixtures (`webapp/fixtures/*.json`).
- **Undecided:** paper citation (added only after publication); starting-point patterns and sharing format (C5.5).

## Brand Commitments

- **Name:** GraphPatch.
- **Feel (from the brief):** precise, calm, scientific-instrument quality; trustworthy rather than playful. Dark and light themes.
- **Voice:** factual and measured. Scope warnings inform; they do not alarm.
- **Paper:** under review; do not cite it or claim publication. Link only to the GitHub repository.

## Evidence on Hand

- **Per-grid test error of the deployed model** `ch52_bal_ft45_s0` (Chunk 52; Chunk 51 balanced test sets of 500 antennas for 12/15/35/45, natural 25×25 test set of 9,983), also in `webapp/public/model/meta.json` → `scope.test`:

  | Grid | MSE (dB²) | MAE (dB) |
  |---|---|---|
  | 12×12 | 1.936 | 0.495 |
  | 15×15 | 1.692 | 0.454 |
  | 25×25 | 1.426 | 0.393 |
  | 35×35 | 0.988 | 0.314 |
  | 45×45 | 1.087 | 0.310 |

- **CNN comparison** (Chunk 53, same balanced test sets, paired): the GATv2 beats the per-grid Gupta et al. CNN on every grid, overall and per class. Test MSE GATv2 vs CNN: 1.936 vs 2.287 (12×12), 1.692 vs 2.784 (15×15), 0.988 vs 1.689 (35×35), 1.087 vs 1.677 (45×45). CNN sizes: 42.8M, 63.5M, 319.5M and 524.3M parameters vs 587k for the single GATv2. No balanced 25×25 comparison exists.
- These numbers apply to single-band and non-functioning antennas only; they are not comparable with natural-distribution results.
- **Absent, never fabricate:** user testimonials, adoption figures, a paper citation or DOI, multi-band accuracy, speed benchmarks beyond those measured in this project.

## Product Principles

1. **Honest scope over impressive output.** Every prediction carries its domain of validity; out-of-scope results are flagged calmly, never hidden or dramatised.
2. **Instant feedback is the product.** Editing and seeing the curve must feel continuous; nothing blocks the loop.
3. **Same numbers as the paper's code.** The browser matches the Python reference bit-for-bit in the graph and within 1e-4 dB in the output.
4. **Engineer-grade clarity.** Units, axes and thresholds are explicit; nothing is decorative at the expense of reading the curve.
5. **Works anywhere, offline.** No accounts, no server, no tracking.

## Accessibility & Inclusion

WCAG 2.1 AA: keyboard-operable grid editor, sufficient contrast in both themes, curve information available as text (verdict, band frequency, minimum), and reduced-motion support.
