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
  caution-light: "oklch(64% 0.120 70)"
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

> Recorded at C3.2 from the approved shape plan, before the UI is built, at the user's request. The build (C5) implements these tokens; the C6 finish re-documents this file from the built screen.

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
- **Caution amber** (`caution` / `caution-light`): the fill meter bar outside 30–80% and its icon; the message text stays in silkscreen/ink.

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

- **Desktop (≥ 1200px):** top bar; two columns. Left: the board, sized to fit square in the viewport height, with tools and the fill meter below. Right: the plot, a row of four fixed result cells, the scope notice when needed, the validity note.
- **Tablet (768–1199px):** landscape keeps two tighter columns; portrait stacks board (≤ 600px), plot, results, note.
- **Mobile (< 768px):** one column; a compact sticky result summary (verdict and band) above the board; the grid size becomes a select; touch-drag paints inside the board only.
- **Spacing:** 4px base (`xs` 4 to `2xl` 48). More space above a section label than below it.

## Elevation & Depth

None. The system is flat: hierarchy comes from the laminate/substrate step and hairline rules. No shadows, glows or blur.

## Shapes

Square by default, like etched copper pads: pixels and the board have no radius; controls take `sm` (2px), panels `md` (4px). No pills, no large radii.

## Components

### Buttons
- **Primary** (action background, laminate text): the one main action in a region (e.g. Retry). Hover lightens the action one step; focus shows a 2px silkscreen outline offset 2px.
- **Secondary** (laminate background, rule border, silkscreen text): tools (Copper, Etch, Clear, Random, Starting points). The active tool takes an action-coloured border and text.

### Navigation
- **Grid-size segmented control:** 12×12 to 45×45, square segments, the selected one filled with action. On mobile a native select.

### Cards / Containers
- **Result cells:** four fixed cells (Verdict, Band, Min |S11|, Metal fill), label above value, separated by rules; values replace in place, never resize the row.
- **Scope notice:** substrate panel with a muted info icon and body text, no red, no animation. Appears under the results only when the prediction has 2+ bands.

### The Board (signature component)
The editable N×N pixel grid on the substrate field, framed by silkscreen dimension lines (overall 32.4 mm, pixel pitch). Live copper vs floating copper per the North Star; seed pixels hatched and locked (not-allowed cursor, hint "Seed pixel: always metal"); the feed pixel carries a small silkscreen ring. One tab stop; arrow keys move, Space toggles, Shift+arrows paint.

### The Plot
|S11| in dB (0 to −30, extending if needed) over 1–4 GHz on substrate with rule gridlines; the curve in silkscreen/ink at 2px; the −10 dB line in threshold red with its label; band markers as a dashed drop line with the frequency. Hover or keyboard focus shows a crosshair readout. While a prediction is pending the previous curve stays and an "updating" mark shows in the plot header.

### Motion
150–200ms ease-out state transitions only (value swap, notice reveal); no load choreography; nothing moves under `prefers-reduced-motion`.

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
