---
target: GridSizeSelector and FillMeter (C5.2)
total_score: 22
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 4
target_identity: "file:G:\\antenna_gnn\\webapp\\src\\components"
timestamp: 2026-11-06T02-12-39Z
slug: webapp-src-components
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Fill updates live; a confirmed size change is never announced |
| 2 | Match system / real world | 3 | Domain terms fit; "edits" is vague |
| 3 | User control and freedom | 2 | Switch cannot be undone; focus on the destructive button; Escape only inside the question |
| 4 | Consistency and standards | 2 | Toggle buttons where radio semantics fit; DESIGN.md mobile select not built |
| 5 | Error prevention | 2 | Enter twice wipes work; question stale after undo |
| 6 | Recognition rather than recall | 3 | Range drawn on the meter; question does not show what is lost |
| 7 | Flexibility and efficiency | 2 | Five tab stops, no arrow keys |
| 8 | Aesthetic and minimalist design | 3 | Dimension line good; fill shown twice |
| 9 | Error recovery | 2 | Warning not directional, no next step |
| 10 | Help and documentation | n/a | Validity note not built (C5.4) |
| Total | | 22/36 | Acceptable (61%) |

## Design Specificity Verdict
Fill meter authored (training range as a silkscreen dimension line; displayed % never contradicts the warning). Segmented control and question generic; the question is a stock popover covering the board.
Detector: CLI 0 findings on GridSizeSelector.tsx, FillMeter.tsx, App.tsx; injected detector "No anti-patterns found" in loaded and question-open states. Measurements caught light-theme amber 2.85:1 vs track, 2.05:1 vs band (< 3:1). Hairline borders 1.4-1.7:1 are false positives.

## Priority Issues
- [P1] Focus lost to BODY after confirming; size change not announced. Fix: focus the new segment, polite announcement.
- [P1] Default focus on the destructive Switch button; consequence not in the accessible description. Fix: focus Keep (primary), Switch secondary, aria-describedby.
- [P1] Question covers the board, stays open while painting, stale after undo to unedited. Fix: close on outside pointerdown, show only while edited, Escape from segments.
- [P1] Light caution amber fails 3:1 and reads as copper (One Job Rule). Fix: caution-light oklch(58% 0.11 88); bounds as ticks across the track instead of a band fill.
- [P2] Warning one-directional, no next step, no back-in-range announcement, amber on first load (seeds-only ~10%).

## Persona Red Flags
- Alex: five tab stops, no arrows; confirm on every switch; Ctrl+Z works while the question is open.
- Sam: focus to BODY; consequence unread; no size or back-in-range announcement; aria-pressed vs radiogroup.
- Casey: 34px segments and 36px buttons (< 44px); top bar wraps to ~125px; question covers the board; no native select.

## Minor Observations
Pressed segment 0.27px wider (weight 600); aria-valuenow parses display text; redundant max-width; Escape focuses the declined size; warning region collapse will shift the stacked mobile layout.

## Questions to Consider
Grid size beside the board instead of the top bar? Meter absorbs the "N of M pixels metal" count? Remember each grid's last pattern instead of confirming?
