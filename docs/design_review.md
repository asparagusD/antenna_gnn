# GraphPatch design review

Living record of the Chunk 6 design passes (Impeccable). Each section lists ranked findings with severity
(P0 blocking, P1 fix before release, P2 minor, P3 polish), the decision taken and the commit that closed it.
Detector findings that are not fixed are justified here, never silently ignored.

## C6.1 Critique of the whole app (2026-11-06)

Method: dual-agent Impeccable critique (A: design review in its own browser tab at 1440×900, 1024×768,
768×1024 and 375×812, dark and light; B: `impeccable detect` CLI and in-page detector, measured contrast,
layout, touch targets, focus order, console). Snapshot: `.impeccable/critique/*__webapp-src-app-tsx.md`.

### Scores (Nielsen, 0–4)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Top bar says "model meta loaded: 5 grids" (metadata, not the model); loading shows no size |
| 2 | Match system / real world | 3 | mm, pitch, dB, GHz right; "Random antenna" mostly yields non-antennas |
| 3 | User control and freedom | 3 | Undo/redo, Keep-first confirmation, dismissable share error |
| 4 | Consistency and standards | 2 | Plot readout, mobile select and sticky summary, theme toggle from DESIGN.md missing |
| 5 | Error prevention | 3 | Locked seeds, size confirmation, clamped slider |
| 6 | Recognition rather than recall | 3 | No visible board legend; instructions screen-reader only |
| 7 | Flexibility and efficiency | 2 | No plot readout, no pattern import, five size tab stops |
| 8 | Aesthetic and minimalist design | 3 | Restrained; resonance shown three times; tools wrap into ragged rows |
| 9 | Error recovery | 3 | Calm, specific share-link error; broken URL replaced at once |
| 10 | Help and documentation | 2 | Honest validity note; no legend or how-to |
| | **Total** | **26/40** | **Acceptable (65%)** |

### Design specificity

Authored on the board (laminate field, flat copper, hatched seeds, dashed floating islands, the dimension
line, live copper: the best moment in the app). The right column is a well-made but generic engineering
dashboard; the top bar is the weakest surface.

Detector: CLI `detect --json webapp/src`: 0 findings. In-page detector: `line-length` on the validity
paragraph (about 92 characters per line) in every state; `text-occlusion` of the chart title by the open
grid-size question (state with the question open). See "Detector findings" below.

### Ranked findings

| Rank | Sev | Finding | Evidence | Decision |
|---|---|---|---|---|
| 1 | **P0** | Tablet portrait (768×1024, any tall viewport ≥ 768 px wide) keeps two columns: the board takes 556 px, the results column 101 px; chart is a 101×100 thumbnail, results text overlaps, page scrolls sideways (scrollWidth 1088 at 768) | B layout table; App.css `minmax(0, min(100%, calc(100dvh − 468px), 640px)) 1fr` with the single-column breakpoint at 767 px | **Fixed** f28e788 (stack under aspect ratio 5/4) |
| 2 | **P1** | Top bar shows developer text "model meta loaded: 5 grids" in a status region; it says "loaded" while the chart says "Loading model…" | App.tsx top bar; A, B | **Fixed** abbbce7 (model status from the worker) |
| 3 | **P1** | Board undersized on desktop: 432 px at 1440×900 beside an 897 px chart (45×45 pixels ≈ 9.6 px; at 1024×768, 300 px ≈ 6.7 px) because two tool rows and the meter sit under it | A; App.css height reserve 468 px | **Fixed** 3875d37 (Starting points in the top bar; board 432 → 520 px column) |
| 4 | **P1** | First run is a failure state: seeds only (10.4 % fill, amber warning, "No / None"), and Random antenna gave a functioning design 3 of 20 times; the approved "starting antenna with its curve" was not built | A emotional journey; surface brief "ready (starting antenna with its curve)" | **Fixed** 624f3c6 (user decision: every grid opens on its fixture example) |
| 5 | P2 | Phone: chart starts below the fold (y ≈ 828–874 at 375×812); DESIGN.md's sticky compact summary and size select are missing; 34–36 px touch targets | A, B | C6.3 (adapt) |
| 6 | P2 | Multi-band curves are not annotated in place: only the global minimum is marked, though the brief says "every band labelled" | S11Chart.tsx | C6.5 or later |
| 7 | P2 | "Link copied" never clears and later becomes untrue | ShareTools.tsx | C6.4 (harden) |
| 8 | P2 | No plot readout (DESIGN.md crosshair on hover/focus) | S11Chart.tsx | Later (feature) |
| 9 | P2 | No visible board legend or instructions (hatch, dashes, ring explained only on hover) | GridEditor.tsx | C6.5 (polish) |
| 10 | P2 | Layout shift when the band table appears pushes Share and the note down | ResultsPanel.tsx | C6.5 |
| 11 | P2 | Grid-size question covers the chart title (detector `text-occlusion`) and, on phones, the board | GridSizeSelector.css | C6.3 |
| 12 | P3 | Validity paragraph about 92 characters per line (detector `line-length`) | ValidityNote.css | C6.5 |
| 13 | P3 | No theme toggle; CNN comparison from the brief not shown; only one h2; band table clips on phones; no download confirmation; invalid share URL replaced at once | A | C6.3–C6.5 as they fit |

Known and accepted (not findings): confirmation on grid-size change, chart auto range, repository-only
link, 30–80 % random-fill range (user decisions in C5.2–C5.5).

### Detector findings (C6.1)

| Finding | Where | Disposition |
|---|---|---|
| `line-length` (~92 ch) | `.validity p` | Real; fix in C6.5 (rank 12) |
| `text-occlusion` | chart title under the open grid-size question | Real while the question is open; addressed with rank 11 in C6.3 |

## C6.2 Audit (2026-11-06)

Method: Impeccable audit (code-level). Evidence: `@axe-core/playwright` (WCAG 2.1 A/AA tags) over the loaded app,
the Starting points panel, the grid-size question, the share-link error, the fill warning and the scope notice,
in dark and light, plus stacked 768×1024 and 375×812 (`e2e/a11y.spec.ts`); the C6.1 measurements (contrast,
focus order, touch targets); `npm run build` sizes; 200% text zoom at 1280×800; source reading.

### Scores

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | axe: one serious violation (band table scroll region not focusable on phones); 200% text overlaps result values |
| 2 | Performance | 2 | The JSEP (WebGPU/WebNN) onnxruntime build ships 29.5 MB of wasm (7.1 MB gzip) that the CPU-only app never uses |
| 3 | Theming | 4 | All colour through tokens (hex only as canvas fallbacks); board redraws on theme change; light theme verified |
| 4 | Responsive | 2 | Phone and tablet gaps (C6.3): 34–36 px targets (AA 24 px passes), board swallows scroll, chart below the fold |
| 5 | Implementation integrity | 3 | Detector: 0 CLI findings; in-page `line-length` and `text-occlusion` (C6.1 table) |
| | **Total** | **14/20** | **Good** |

Implementation integrity verdict: **pass**. Tokens, components and copy follow DESIGN.md; the deviations are
recorded user decisions or open findings below.

### Findings

| Sev | Finding | Location | Standard | Decision |
|---|---|---|---|---|
| **P1** | Band table scrolls sideways on phones but cannot receive focus, so keyboard users cannot scroll it | ResultsPanel.css (`display:block; overflow-x:auto` on the table) | WCAG 2.1.1; axe `scrollable-region-focusable` (serious) | **Fixed** 2af9d69 (focusable labelled scroll region) |
| **P1** | 200% text: result values overlap their neighbours and the page scrolls 76 px sideways | ResultsPanel.css (fixed 4 / 2 columns, `white-space: nowrap`) | WCAG 1.4.4 Resize text | **Fixed** 1484bb2 (auto-fit cells) |
| **P1** | 29.5 MB JSEP wasm (WebGPU/WebNN) shipped though inference is CPU wasm only; first load ≈ 7.1 MB gzip + 2.6 MB model | `import * as ort from 'onnxruntime-web'` (infer.ts) | Performance budget, offline-first | **Fixed** 185f2bd (`onnxruntime-web/wasm`: 14.8 MB, 3.9 MB gzip; latency equal or better) |
| P2 | Grid size is five toggle buttons (five tab stops) rather than a radio group with arrow keys | GridSizeSelector.tsx | ARIA APG radio group | C6.5 |
| P2 | "\|S11\|" in the chart title is read as "vertical bar S 11 vertical bar" | S11Chart.tsx | — | C6.5 |
| P2 | Touch targets 34–36 px (AA 24 px passes; 44 px recommended); board `touch-action: none` swallows page scroll | GridSizeSelector.css, App.css, GridEditor.css | WCAG 2.5.5 (AAA) | C6.3 |
| P2 | No theme toggle (approved shape lists one); theme follows the system only | App.tsx | — | C6.5 |
| P3 | The example grid is decoded on every render to decide "edited" | App.tsx | — | C6.5 |
| P3 | Native range track (UA-drawn) 1.07–1.53:1 against the panel; thumb and filled part pass | StartingPoints.css | WCAG 1.4.11 (UA styling) | Justified: native control, thumb and value text carry the state |
| P3 | Button and segment borders 1.4–1.7:1; buttons are identified by their text labels | App.css, GridSizeSelector.css | WCAG 1.4.11 | Justified: text label identifies the control |

Positive: axe clean in every other state and both themes; every focus stop has a visible 2 px ring; one tab
stop for the board with full keyboard painting; polite live regions that do not flood; reduced motion swaps the
chart without a tween; no console errors.
