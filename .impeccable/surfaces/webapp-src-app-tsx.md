---
version: 1
slug: "webapp-src-app-tsx"
primary_target: "webapp/src/App.tsx"
related_targets: []
---

# Core screen: pattern editor and live |S11|

## Scope and mode

Operate. The single core screen of GraphPatch (webapp/src/App.tsx and its components), dark and light themes, desktop, tablet and mobile. No landing page. Starting points and share/export land in C5.5.

## Audience, task, proof

RF researchers, students and paper reviewers paint or load an N×N pattern (12, 15, 25, 35, 45), read the predicted |S11| (1–4 GHz), the functioning verdict, the band frequency and the minimum, and judge how far to trust it. Proof on screen: per-grid test error and the CNN comparison from PRODUCT.md, always with the balanced-test-set caveat; no paper citation, repository link only.

## Approved shape (C3.2)

Desktop: top bar (GraphPatch, grid segmented control, Starting points, theme toggle, model status); left column board with tools and fill meter; right column plot, four fixed result cells, scope notice when needed, validity note. Tablet: landscape two columns, portrait stacked. Mobile: one column, sticky compact summary above the board, grid size as a select, touch-drag painting inside the board only.

States: loading model (editable board, plot shows "Loading model (2.6 MB)…" with progress, cells "—"); ready (starting antenna with its curve); inferring (previous curve stays, "updating" mark in the plot header, throttled about every 100 ms during a drag and once on release); fill warning (amber meter outside 30–80% with words); out of scope (2+ bands: calm notice under the results, curve stays with every band labelled); not functioning; minimum at a band edge; error (inline in the plot area with Retry, editor stays usable). Grid change swaps to that grid's starting pattern with an undo toast when edited.

## Direction contract

THESIS: The editor is the board you would etch: flat copper on microwave laminate beside a silkscreen-annotated |S11| plot. It refuses the category default of a grey dashboard with a blue plotting-library chart.

OWN-WORLD: Dark laminate ground and lighter substrate field (cool white PTFE in light theme), flat copper pixels, silkscreen off-white type and hairline rules, a laminate-green action colour only on pressable controls, threshold red only on the −10 dB line, caution amber only on the fill meter. Public Sans throughout with tabular figures; square pads, 2px controls, no shadows or textures.

STORY: The visitor paints copper, sees which copper is live (connected to the feed), watches the curve, verdict and band update in place, and reads the validity note and, when relevant, the calm scope notice, so they trust the number for single-band designs and know when not to.

FIRST VIEWPORT: Top bar across the width. Left: the square board filling the column height minus tools, framed by silkscreen dimension lines (32.4 mm overall, pixel pitch), hatched seeds, the feed ring; tools and the fill meter beneath. Right: the plot taking most of the column, then the four result cells, then the validity note. The primary interaction is painting on the board; there is no hero.

FORM: Microwave laminate, position 1 of 7 on the ordered list (the roll assigned position 6, the engineering notebook; the user chose the pick). Signature move: live copper, feed-connected copper in full copper and floating islands duller with a dashed edge, recomputed as you paint. Raises kept from the declined challengers: one job per accent colour, out-of-scope curves annotated in place, fill patterns not colour alone, fixed result cells, readouts on hover or focus only, action colour only on pressable controls. seed:3386c34655d51d07

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

Starting-point pattern set and the share/export format (C5.5).
