---
name: GraphPatch
description: Instant |S11| prediction for pixelated microstrip patch antennas, drawn as copper on laminate.
colors:
  laminate: "oklch(22% 0.020 165)"
  substrate: "oklch(27% 0.022 165)"
  rule: "oklch(38% 0.022 165)"
  silkscreen: "oklch(93% 0.012 95)"
  silkscreen-muted: "oklch(76% 0.016 150)"
  copper: "oklch(68% 0.115 55)"
  copper-floating: "oklch(60% 0.050 60)"
  action: "oklch(74% 0.090 175)"
  threshold: "oklch(68% 0.170 28)"
  caution: "oklch(80% 0.130 80)"
  laminate-light: "oklch(97.5% 0.004 165)"
  substrate-light: "oklch(93.5% 0.008 165)"
  rule-light: "oklch(83% 0.012 165)"
  ink: "oklch(25% 0.020 165)"
  ink-muted: "oklch(44% 0.020 165)"
  copper-light: "oklch(55% 0.120 55)"
  copper-floating-light: "oklch(61% 0.045 60)"
  action-light: "oklch(44% 0.075 175)"
  threshold-light: "oklch(52% 0.180 28)"
  caution-light: "oklch(58% 0.110 88)"
typography:
  title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0em"
  small:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0em"
  value:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  axis:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0em"
rounded:
  none: "0px"
  sm: "2px"
  md: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.laminate}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.laminate}"
    textColor: "{colors.silkscreen}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "36px"
  segment:
    backgroundColor: "{colors.laminate}"
    textColor: "{colors.silkscreen}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "7px 14px"
  segment-selected:
    backgroundColor: "{colors.action}"
    textColor: "{colors.laminate}"
  board:
    backgroundColor: "{colors.substrate}"
    rounded: "{rounded.none}"
    padding: "18px"
  pixel-copper:
    backgroundColor: "{colors.copper}"
    rounded: "{rounded.none}"
  pixel-floating:
    backgroundColor: "{colors.copper-floating}"
    rounded: "{rounded.none}"
  result-cell:
    backgroundColor: "{colors.laminate}"
    textColor: "{colors.silkscreen}"
    typography: "{typography.value}"
    padding: "14px 16px"
---

# Design System: GraphPatch

> Recorded at C3.2 from the approved shape plan; re-documented from the built screen at C6.5 (tokens unchanged except the light caution; layout and components below describe what ships). Decisions behind each change are in `docs/design_review.md`.

## Overview

**Creative North Star: "The board you would etch."**

GraphPatch draws an antenna the way an RF engineer meets it on the bench: flat copper on microwave laminate, dimensioned like a fabrication drawing. The pixel editor is the board; the |S11| plot and the results read beside it in silkscreen-white type. The world lends four things only: palette, type, density and one signature move. Layout, navigation and controls stay the standard ones of an engineering web tool.

Everything is flat. Copper is a solid colour, not a metal effect; the substrate is a field, not a texture. Precision comes from alignment, tabular numbers and hairline rules.

**Key Characteristics:**
- Copper on laminate, strictly flat; dark laminate by default, cool white PTFE laminate in the light theme.
- **Live copper** (signature move): copper connected to the feed reads full copper; floating islands read duller with a dashed edge, live as you paint.
- Silkscreen dimension lines around the board (32.4 mm, pixel pitch).
- One sans family with tabular numerals for every number.
- Colour does one job per role: copper = metal, action = pressable, threshold red = the −10 dB line, caution amber = fill outside 30–80%.

## Colors

Both themes are complete palettes; the light theme mirrors every dark role (suffix `-light`). Every text pair meets WCAG AA 4.5:1 and every graphic pair 3:1 (checked numerically at C3.2).

### Primary
- **Copper** (`copper` / `copper-light`): metal pixels connected to the feed and the predicted curve's band marker. 5.0:1 / 4.2:1 against the substrate.
- **Floating copper** (`copper-floating` / `copper-floating-light`): metal not connected to the feed. 3.7:1 / 3.2:1 against the substrate; told apart from live copper by lower chroma **and** a dashed edge, never by colour alone.

### Secondary
- **Action** (`action` / `action-light`): a laminate green for controls you can press and the selected segment, nothing else. Laminate text on action 7.8:1; white-ground text on light action 7.0:1.

### Tertiary
- **Threshold red** (`threshold` / `threshold-light`): the −10 dB line and its label only. 5.5:1 / 5.6:1 against the ground.
- **Caution amber** (`caution` / `caution-light`): the fill meter bar outside 30–80% and its icon; the message text stays in silkscreen/ink. The light value is an ochre (hue 88) so it never reads as copper: 3.6:1 on the meter track, 4.0:1 on the page (C5.2 critique).

### Neutral
- **Laminate** (`laminate` / `laminate-light`): page ground.
- **Substrate** (`substrate` / `substrate-light`): the board field and panel surfaces.
- **Rule** (`rule` / `rule-light`): hairline borders, plot gridlines, dimension lines.
- **Silkscreen / ink** (`silkscreen` / `ink`): primary text, 14.0:1 / 14.8:1. **Muted** (`silkscreen-muted` / `ink-muted`): labels and secondary text, ≥ 7:1.

### Named Rules
**The One Job Rule.** Every accent has exactly one job. Red never marks errors, emphasis or decoration; action never colours data; copper never colours chrome.

**The Not-Colour-Alone Rule.** Seed pixels are hatched copper, metal is solid, air is bare substrate; floating copper carries a dashed edge; the scope notice and fill warning always carry words.

## Typography

**Body Font:** Public Sans (self-hosted for offline use), falling back to system-ui.

One family carries the whole interface; numbers always use tabular figures (`font-variant-numeric: tabular-nums`) so values update without moving. Fixed rem scale, ratio about 1.2; no fluid type.

### Hierarchy
- **Title** (650, 1.25rem): the product name in the top bar.
- **Label** (600, 0.75rem, uppercase, 0.06em): section and result-cell labels, silkscreen-muted.
- **Body** (400, 0.9375rem, 1.45): controls, notices, validity note.
- **Small** (400, 0.8125rem): dimension annotations, footnotes.
- **Value** (600, 1.75rem, tabular): the four result values.
- **Axis** (400, 0.75rem, tabular): plot ticks and readouts.

### Named Rules
**The Tabular Rule.** Every number on screen, in every size, uses tabular figures.

## Layout

- **Top bar:** GraphPatch, the grid-size segmented control, Starting points (example antenna, random antenna with fill), the model status ("Loading model (2.6 MB)…", "Model ready · runs in your browser", or the failure) and the theme toggle (System / Light / Dark).
- **Two columns (landscape, aspect ratio > 5/4, ≥ 768px):** left, the board sized square to fit the viewport height with its readout, one tool row (Undo, Redo, Clear), the fill meter and the board legend; right, the plot, four result cells, the band table, the scope notice when needed, Share and export, the validity note.
- **Stacked (portrait tablets and phones: aspect ratio ≤ 5/4 or < 768px):** one column, board (≤ 640px) above the results; a sticky one-line summary (Functioning · Resonance · Depth) pinned above the board scrolls to the chart when pressed.
- **Phones (< 768px):** result cells two to a row; the grid-size question and Starting points open as bottom sheets; the board's frame scrolls the page and two fingers pinch-zoom, one finger paints.
- **Touch (coarse pointer, any size):** every control at least 44×44 px.
- **Spacing:** 4px base (`xs` 4 to `2xl` 48). More space above a section label than below it.

## Elevation & Depth

None. The system is flat: hierarchy comes from the laminate/substrate step and hairline rules. No shadows, glows or blur.

## Shapes

Square by default, like etched copper pads: pixels and the board have no radius; controls take `sm` (2px), panels `md` (4px). No pills, no large radii.

## Components

### Buttons
- **Primary** (action background, laminate text): the one main action in a region: Retry after an error, Keep in the grid-size question. Hover darkens/lightens the action one step; focus shows a 2px silkscreen outline offset 2px.
- **Secondary** (laminate background, rule border, silkscreen text): Undo, Redo, Clear, Starting points, Example antenna, Random antenna, Copy share link, the CSV downloads, the theme toggle, Switch in the grid-size question (the destructive choice is never the loud one). Disabled at 60% opacity.

### Navigation
- **Grid-size segmented control:** 12×12 to 45×45, square joined segments, the selected one filled with action. Kept as segments on phones too (44 px targets fit one row of 343 px; a native select would need two taps). When the board differs from the grid's example, a change asks first in a non-modal question with Keep focused.
- **Starting points:** a disclosure in the top bar; its panel holds Example antenna (the grid's known single-band design from the test fixtures) and Random antenna with a 30–80% fill slider.

### Cards / Containers
- **Result cells:** Functioning (Yes/No), Resonance (deepest band, GHz), Depth (minimum |S11|, dB), Bands (count below −10 dB); label above value, 1px rule separators; cells reflow by content width (four, two, or one per row) and never overlap at 200% text. The band table (centre, depth, −10 dB bandwidth and range) is always present, in a focusable scroll region, with an empty-state row when there is no band. Metal fill lives in the fill meter, not a cell.
- **Scope notice:** substrate panel with a muted info icon and body text, no red, no animation. Appears under the results only when the prediction has 2+ bands; 25×25 has its own wording.
- **Validity note:** surrogate caveat, training scope, the selected grid's test MAE, one repository link.
- **Error panels:** calm substrate panels in words: the share-link error (dismissable) and the startup error (Reload); prediction errors sit inline in the plot header with their detail and Retry where retrying can help.

### The Board (signature component)
The editable N×N pixel grid on the substrate field, framed by silkscreen dimension lines (overall 32.4 mm, pixel pitch). Live copper vs floating copper per the North Star; seed pixels hatched and locked (not-allowed cursor, hint "Seed pixel: always metal"); the feed pixel carries a small silkscreen ring. A legend under the fill meter names each mark with drawn swatches. One tab stop; arrow keys move, Space toggles, Shift+arrows paint. The app opens every grid on its example antenna.

### The Plot
|S11| in dB from +1 dB down to the largest multiple of 5 dB below the minimum (never above −15 dB, −30 dB before the first curve) over 1–4 GHz on substrate with rule gridlines; the curve in silkscreen/ink at 2px; the −10 dB line in threshold red with its label at the end away from the minimum; the minimum as a ring, dashed drop line and "depth · frequency"; with 2+ bands, copper band numbers above the plot matching the table. While a prediction is pending the previous curve stays and "Updating…" shows in the plot header after 150 ms. Not built yet: the hover/keyboard crosshair readout.

### Motion
A 180 ms ease-out tween between predictions and 150–200 ms state transitions only; no load choreography; under `prefers-reduced-motion` the curve swaps at once and nothing animates.

## Do's and Don'ts

### Do:
- **Do** keep copper flat: one solid colour per state.
- **Do** keep an out-of-scope curve on screen and annotate it in place.
- **Do** give every state words as well as colour.
- **Do** use tabular figures for every number.

### Don't:
- **Don't** add PCB costume: solder-mask texture, vias, gold plating, copper sheen or gradients.
- **Don't** use red for anything but the −10 dB line.
- **Don't** use modals for routine states or spinners over the curve.
- **Don't** let the world supply layout or controls; they stay standard web components.
