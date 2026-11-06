---
target: S11Chart (C5.3)
total_score: 22
max_score: 36
na_heuristics: 5
p0_count: 0
p1_count: 1
target_identity: "file:G:\\antenna_gnn\\webapp\\src\\components\\S11Chart.tsx"
target_fingerprint: "sha256:87723ee98c98a44b20c712881598ad8bd09082e46e71bd28705fae1b413b80a1"
target_path: "G:\\antenna_gnn\\webapp\\src\\components\\S11Chart.tsx"
timestamp: 2026-11-06T02-36-19Z
slug: webapp-src-components-s11chart-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Updating mark small/muted; stale curve at full strength; no load size/progress |
| 2 | Match system / real world | 3 | dB/GHz, -10 dB, true minus; no Frequency axis title |
| 3 | User control and freedom | 2 | Auto range rescales under the user; no scale hold |
| 4 | Consistency and standards | 3 | Dashed drop line clashes with dashed = floating copper |
| 5 | Error prevention | n/a | Read-only display |
| 6 | Recognition rather than recall | 3 | -10 dB and minimum labelled in place |
| 7 | Flexibility and efficiency | 1 | No readout (scheduled), no export, not focusable |
| 8 | Aesthetic and minimalist design | 3 | Minimum label loud on flat curves; label collision |
| 9 | Error recovery | 3 | Inline Retry keeps the curve; raw error text |
| 10 | Help and documentation | 2 | Nothing explains -10 dB or the minimum |
| Total | | 22/36 | Acceptable (61%) |

## Design Specificity Verdict
Mostly product-specific (substrate field, silkscreen curve, red only for -10 dB, U+2212, 3-decimal GHz); structurally a generic line chart with tokens. Detector: CLI 0 findings (S11Chart.tsx, S11Chart.css, App.tsx); injected detector clean in two states. Geometry check: drop line crosses the -10 dB label. "4"/"GHz" bbox overlap is padding (false positive). Hidden-pane rAF made timing measures invalid; MutationObserver gave 76 ms click-to-curve.

## Priority Issues
- [P1] Minimum drop line/label collide with the fixed right-end "−10 dB" label when the minimum is above ~3.6 GHz (default load at 12/25/45, worst on mobile); label has no halo. Fix: place the label at the end farther from the minimum, halo, draw above curve and marker.
- [P2] Minimum label shows interpolated values during the tween; loud on non-functioning curves.
- [P2] Staleness not visible on the curve.
- [P2] Screen reader: silent desc, no -10 dB relation, "|S11|" read as pipes, error not an alert.
- [P2] Mobile: chart below the fold.

## Persona Red Flags
- Alex: auto range moves the -10 dB line; no ghost, scale lock or export.
- Sam: silent desc; no announcements; chart not keyboard-reachable.
- Casey: chart below the fold; collision most visible; 220px plot.

## Minor Observations
Ticks pop in at the end of a range tween; GHz unit stacked under the "4" tick; reduced-motion swap waits for rAF; fragile formatDb(-10).replace; no load size/progress; dashed drop line vocabulary clash.

## Questions to Consider
Annotate the minimum once band markers exist? Silence for curves that never cross -10 dB? Ghost of the previous curve?
