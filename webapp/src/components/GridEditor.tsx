/**
 * The board (DESIGN.md "The Board"): an editable N×N pixel grid drawn as flat copper on laminate.
 *
 * - Canvas sized in device pixels with every cell edge snapped to a whole device pixel, so it is
 *   crisp at any DPR and every N up to 45×45.
 * - Live copper (signature): metal connected to the feed (8-connected) is full copper; floating
 *   islands are duller with a dashed inset edge. Seed pixels are hatched and locked; the feed pixel
 *   carries a silkscreen ring.
 * - Pointer: press toggles; dragging paints with the value the first pixel took (a stroke that
 *   starts on a locked seed pixel paints metal, extending the feed region). Touch and pen use the
 *   same pointer events.
 * - Keyboard: one tab stop; arrows move a cursor, Space/Enter toggles, Shift+arrows paint with the
 *   last toggled value, Home/End and PageUp/PageDown jump to the edges. A live region announces the
 *   cursor's pixel.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { feedComponent, type GraphSpec } from '../core/graph';
import { paint, type Cell as CellValue, type Grid } from '../core/grid';
import { cellAt, cellEdges, cellRect, lineCells, moveCursor, type Cell } from './gridGeometry';
import './GridEditor.css';

export interface GridEditorProps {
  grid: Grid;
  spec: GraphSpec;
  onChange: (grid: Grid) => void;
  /** Called when a pointer stroke or a keyboard edit finishes (e.g. to run the final prediction). */
  onStrokeEnd?: () => void;
}

/** Overall patch width in mm (32.375 / N mm per pixel in the training data). */
const PATCH_MM = 32.375;

interface Palette {
  substrate: string;
  rule: string;
  copper: string;
  floating: string;
  text: string;
  muted: string;
  action: string;
}

function readPalette(element: Element): Palette {
  const style = getComputedStyle(element);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    substrate: v('--substrate', '#1c2a24'),
    rule: v('--rule', '#38463f'),
    copper: v('--copper', '#ce844f'),
    floating: v('--copper-floating', '#977a62'),
    text: v('--text', '#eae8df'),
    muted: v('--text-muted', '#aab4ac'),
    action: v('--action', '#68bea8'),
  };
}

interface DrawState {
  grid: Grid;
  live: Uint8Array;
  feed: readonly [number, number];
  hover: Cell | null;
  cursor: Cell | null;
}

function draw(canvas: HTMLCanvasElement, state: DrawState): void {
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  const px = canvas.width;
  const { N, cells, seed } = state.grid;
  const palette = readPalette(canvas);
  const dpr = px / Math.max(1, canvas.clientWidth);
  const cellPx = px / N;

  ctx.fillStyle = palette.substrate;
  ctx.fillRect(0, 0, px, px);

  // Grid lines show only on bare substrate (copper is drawn over them, like a pour).
  // Dense grids get quiet minor lines with a full-strength line every 5 cells.
  const dense = cellPx < 14 * dpr;
  const line = Math.max(1, Math.round(dpr));
  ctx.fillStyle = palette.rule;
  for (let i = 1; i < N; i++) {
    ctx.globalAlpha = dense && i % 5 !== 0 ? 0.4 : 1;
    const [edge] = cellEdges(i, px, N);
    ctx.fillRect(edge - Math.floor(line / 2), 0, line, px);
    ctx.fillRect(0, edge - Math.floor(line / 2), px, line);
  }
  ctx.globalAlpha = 1;

  const hatch = Math.max(3, Math.round(cellPx / 4));
  for (let k = 0; k < N * N; k++) {
    if (cells[k] !== 1) continue;
    const row = Math.floor(k / N);
    const col = k - row * N;
    const [x, y, w, h] = cellRect({ row, col }, px, N);
    const live = state.live[k] === 1;
    ctx.fillStyle = live ? palette.copper : palette.floating;
    ctx.fillRect(x, y, w, h);
    if (seed[k] === 1) {
      // Locked seed pixel: diagonal hatching in substrate over the copper.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = palette.substrate;
      ctx.lineWidth = Math.max(1, hatch / 2.6);
      ctx.beginPath();
      for (let d = -h; d < w; d += hatch) {
        ctx.moveTo(x + d, y + h);
        ctx.lineTo(x + d + h, y);
      }
      ctx.stroke();
      ctx.restore();
    } else if (!live && w >= 8 * dpr) {
      // Floating copper: dashed inset edge (never colour alone).
      ctx.save();
      ctx.strokeStyle = palette.muted;
      ctx.lineWidth = line;
      ctx.setLineDash([2 * line, 2 * line]);
      const inset = Math.max(2, Math.round(w * 0.18));
      ctx.strokeRect(
        x + inset + 0.5 * line,
        y + inset + 0.5 * line,
        w - 2 * inset - line,
        h - 2 * inset - line,
      );
      ctx.restore();
    }
  }

  // Feed pixel: silkscreen ring.
  const [fr, fc] = state.feed;
  const [fx, fy, fw, fh] = cellRect({ row: fr, col: fc }, px, N);
  ctx.strokeStyle = palette.text;
  ctx.lineWidth = Math.max(1.5 * dpr, fw * 0.12);
  ctx.beginPath();
  ctx.arc(fx + fw / 2, fy + fh / 2, Math.max(2 * dpr, Math.min(fw, fh) * 0.28), 0, 2 * Math.PI);
  ctx.stroke();

  const outline = (cell: Cell, color: string, width: number) => {
    const [x, y, w, h] = cellRect(cell, px, N);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(x + width / 2, y + width / 2, w - width, h - width);
  };
  if (state.hover) outline(state.hover, palette.action, line);
  if (state.cursor) outline(state.cursor, palette.action, 2 * line);
}

function describe(grid: Grid, cell: Cell, feed: readonly [number, number]): string {
  const k = cell.row * grid.N + cell.col;
  const where = `Row ${String(cell.row + 1)}, column ${String(cell.col + 1)}`;
  if (cell.row === feed[0] && cell.col === feed[1]) return `${where}: feed pixel, always metal`;
  if (grid.seed[k] === 1) return `${where}: seed pixel, always metal (feed region)`;
  return `${where}: ${grid.cells[k] === 1 ? 'metal' : 'air'}`;
}

export function GridEditor({ grid, spec, onChange, onStrokeEnd }: GridEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef(grid);
  const strokeRef = useRef<{ value: CellValue; last: Cell; pointerId: number } | null>(null);
  const penRef = useRef<CellValue>(1);
  const [hover, setHover] = useState<Cell | null>(null);
  const [cursor, setCursor] = useState<Cell | null>(null);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [devicePx, setDevicePx] = useState(0);
  const [, setThemeTick] = useState(0);
  const instructionsId = useId();

  useLayoutEffect(() => {
    gridRef.current = grid;
  }, [grid]);
  const { N } = grid;
  const feed = useMemo<readonly [number, number]>(() => spec.feed_rc[String(N)] ?? [0, 0], [spec, N]);
  const live = useMemo(() => feedComponent(grid, spec), [grid, spec]);
  const metalCount = useMemo(() => grid.cells.reduce((sum, v) => sum + v, 0), [grid]);

  // Size the canvas in device pixels from the rendered box.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const measure = (entry?: ResizeObserverEntry) => {
      // devicePixelContentBoxSize is missing in older Safari; fall back to CSS width x DPR.
      const sizes: readonly ResizeObserverSize[] | undefined = entry?.devicePixelContentBoxSize;
      const exact = sizes?.[0]?.inlineSize;
      const width = exact ?? Math.round(canvas.clientWidth * window.devicePixelRatio);
      setDevicePx(Math.max(1, width));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return; // jsdom and very old browsers: measured once
    const observer = new ResizeObserver((entries) => {
      measure(entries[0]);
    });
    try {
      observer.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
      observer.observe(canvas);
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  // Redraw when the theme changes (system preference or the data-theme attribute).
  useEffect(() => {
    const bump = () => {
      setThemeTick((t) => t + 1);
    };
    // matchMedia is missing in jsdom; the data-theme observer still works there.
    const media =
      typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;
    media?.addEventListener('change', bump);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media?.removeEventListener('change', bump);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || devicePx === 0) return;
    if (canvas.width !== devicePx) {
      canvas.width = devicePx;
      canvas.height = devicePx;
    }
    draw(canvas, { grid, live, feed, hover, cursor: focused ? cursor : null });
  });

  const cellFromEvent = useCallback(
    (event: { clientX: number; clientY: number }, clampToBoard: boolean): Cell | null => {
      const canvas = canvasRef.current;
      if (canvas === null) return null;
      const box = canvas.getBoundingClientRect();
      let x = event.clientX - box.left;
      let y = event.clientY - box.top;
      if (clampToBoard) {
        x = Math.min(box.width, Math.max(0, x));
        y = Math.min(box.height, Math.max(0, y));
      }
      return cellAt(x, y, box.width, gridRef.current.N);
    },
    [],
  );

  const apply = useCallback(
    (cells: Cell[], value: CellValue) => {
      let next = gridRef.current;
      for (const cell of cells) next = paint(next, cell.row, cell.col, value);
      if (next !== gridRef.current) {
        gridRef.current = next;
        onChange(next);
      }
    },
    [onChange],
  );

  const updateTooltip = (event: React.PointerEvent, cell: Cell | null) => {
    const board = boardRef.current;
    const g = gridRef.current;
    if (board === null || cell === null || g.seed[cell.row * g.N + cell.col] !== 1) {
      setTooltip(null);
      return;
    }
    const box = board.getBoundingClientRect();
    const isFeed = cell.row === feed[0] && cell.col === feed[1];
    setTooltip({
      x: event.clientX - box.left,
      y: event.clientY - box.top,
      text: isFeed ? 'Feed pixel: always metal' : 'Always metal: feed region',
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const cell = cellFromEvent(event, false);
    if (cell === null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const g = gridRef.current;
    const k = cell.row * g.N + cell.col;
    const value: CellValue = g.seed[k] === 1 ? 1 : g.cells[k] === 1 ? 0 : 1;
    strokeRef.current = { value, last: cell, pointerId: event.pointerId };
    penRef.current = value;
    setCursor(cell);
    apply([cell], value);
    setAnnouncement(describe(gridRef.current, cell, feed));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = strokeRef.current;
    if (stroke !== null && stroke.pointerId === event.pointerId) {
      const cell = cellFromEvent(event, true);
      if (cell !== null && (cell.row !== stroke.last.row || cell.col !== stroke.last.col)) {
        apply(lineCells(stroke.last, cell), stroke.value);
        stroke.last = cell;
        setCursor(cell);
      }
    }
    if (event.pointerType !== 'touch') {
      const cell = cellFromEvent(event, false);
      setHover((prev) => (prev?.row === cell?.row && prev?.col === cell?.col ? prev : cell));
      updateTooltip(event, cell);
    }
  };

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = strokeRef.current;
    if (stroke === null || stroke.pointerId !== event.pointerId) return;
    strokeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    onStrokeEnd?.();
  };

  const onPointerLeave = () => {
    if (strokeRef.current === null) setHover(null);
    setTooltip(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const g = gridRef.current;
    const current = cursor ?? { row: feed[0], col: feed[1] };
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const k = current.row * g.N + current.col;
      if (g.seed[k] !== 1) {
        const value: CellValue = g.cells[k] === 1 ? 0 : 1;
        penRef.current = value;
        apply([current], value);
        onStrokeEnd?.();
      }
      setCursor(current);
      setAnnouncement(describe(gridRef.current, current, feed));
      return;
    }
    const next = moveCursor(current, event.key, g.N);
    if (next === null) return;
    event.preventDefault();
    if (event.shiftKey) {
      apply(lineCells(current, next), penRef.current);
      onStrokeEnd?.();
    }
    setCursor(next);
    setAnnouncement(describe(gridRef.current, next, feed));
  };

  const readout = hover ?? (focused ? cursor : null);
  const pitch = (PATCH_MM / N).toFixed(2);

  return (
    <figure className="board-figure">
      <div
        ref={boardRef}
        className="board"
        role="application"
        tabIndex={0}
        aria-roledescription="pixel editor"
        aria-label={`Metal pattern, ${String(N)} by ${String(N)} pixels`}
        aria-describedby={instructionsId}
        data-n={N}
        data-metal-count={metalCount}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setFocused(true);
          if (cursor === null) setCursor({ row: feed[0], col: feed[1] });
        }}
        onBlur={() => {
          setFocused(false);
        }}
      >
        <canvas
          ref={canvasRef}
          className="board-canvas"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={onPointerLeave}
          onContextMenu={(e) => {
            e.preventDefault();
          }}
        />
        {tooltip && (
          <span className="board-tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            {tooltip.text}
          </span>
        )}
      </div>
      <div className="board-dimension" aria-hidden="true">
        <span className="board-dimension-label">32.4 mm · {pitch} mm/px</span>
      </div>
      <figcaption className="board-readout">
        <span aria-live="polite">{focused ? announcement : ''}</span>
        <span className="board-readout-visible" aria-hidden="true">
          {readout ? describe(grid, readout, feed) : `${String(metalCount)} of ${String(N * N)} pixels metal`}
        </span>
      </figcaption>
      <p id={instructionsId} className="visually-hidden">
        Click or press Space to toggle a pixel; drag or hold Shift with the arrow keys to paint. Arrow keys
        move the cursor; Home and End jump to the row ends. Hatched seed pixels around the feed are always
        metal.
      </p>
    </figure>
  );
}
