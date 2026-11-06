/**
 * Live |S11| chart (DESIGN.md "The Plot"), drawn as SVG at the container's real pixel size.
 *
 * - x: 1–4 GHz; y: dB from +1 dB down to the largest multiple of 5 dB below the minimum (chartScale.ts).
 * - The −10 dB reference line in threshold red with its label (its only use of red); the minimum is
 *   marked with a ring, a dashed drop line and "depth · frequency".
 * - A new prediction tweens from the shown curve (and y range) over 180 ms with an ease-out; under
 *   prefers-reduced-motion it swaps at once. State is only set from animation-frame callbacks.
 * - The previous curve never blanks: "Updating…" shows in the header while a prediction runs
 *   (revealed by CSS after a short delay so fast edits do not flicker); before the first curve the
 *   plot shows "Loading model…" on empty axes; an error shows inline with Retry, keeping the curve.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { freqGhz } from '../core/analysis';
import {
  F_MAX_GHZ,
  F_MIN_GHZ,
  TOP_DB,
  curvePath,
  easeOut,
  formatDb,
  formatGhz,
  formatTick,
  lerpCurve,
  linear,
  xTicks,
  yBottom,
  yTicks,
} from './chartScale';
import './S11Chart.css';

export type ChartStatus = 'loading' | 'ready' | 'updating' | 'error';

export interface S11ChartProps {
  /** Latest |S11| in dB at the 201 frequencies, or null before the first prediction. */
  db: Float64Array | null;
  status: ChartStatus;
  error?: string;
  onRetry?: () => void;
}

interface Frame {
  db: Float64Array;
  bottom: number;
}

const TWEEN_MS = 180;
const REFERENCE_LABEL = '−10 dB';
const MARGIN = { top: 14, right: 18, bottom: 34, left: 44 };
const DEFAULT_SIZE = { width: 640, height: 360 };

function argmin(db: ArrayLike<number>): number {
  let best = 0;
  for (let k = 1; k < db.length; k++) if ((db[k] as number) < (db[best] as number)) best = k;
  return best;
}

const frameOf = (db: Float64Array): Frame => ({ db, bottom: yBottom(db[argmin(db)] as number) });

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The frame on screen: the target, or an in-between frame while tweening towards it. */
function useTween(target: Float64Array | null): Frame | null {
  const [shown, setShown] = useState<Frame | null>(null);
  const lastShown = useRef<Frame | null>(null);
  const display = shown ?? (target === null ? null : frameOf(target));

  useEffect(() => {
    lastShown.current = display;
  });

  useEffect(() => {
    if (target === null) return;
    const to = frameOf(target);
    const from = lastShown.current;
    let raf = 0;
    if (from === null || from.db === to.db || reducedMotion()) {
      raf = requestAnimationFrame(() => {
        setShown(to);
      });
    } else {
      const start = performance.now();
      const step = (time: number) => {
        const t = easeOut((time - start) / TWEEN_MS);
        setShown(
          t >= 1
            ? to
            : { db: lerpCurve(from.db, to.db, t), bottom: from.bottom + (to.bottom - from.bottom) * t },
        );
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [target]);

  return display;
}

function useSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState(DEFAULT_SIZE);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const width = Math.max(240, Math.round(entry.contentRect.width));
      setSize({ width, height: Math.round(Math.min(420, Math.max(220, width * 0.58))) });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return size;
}

export function S11Chart({ db, status, error, onRetry }: S11ChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(boxRef);
  const frame = useTween(db);
  const titleId = useId();
  const descId = useId();
  const clipId = useId();

  const bottom = frame?.bottom ?? yBottom(null);
  const x0 = MARGIN.left;
  const x1 = width - MARGIN.right;
  const y0 = MARGIN.top;
  const y1 = height - MARGIN.bottom;
  const sx = linear([F_MIN_GHZ, F_MAX_GHZ], [x0, x1]);
  const sy = linear([TOP_DB, bottom], [y0, y1]);

  const min = frame === null ? null : argmin(frame.db);
  const minDb = min === null || frame === null ? null : (frame.db[min] as number);
  const minGhz = min === null ? null : (freqGhz[min] as number);
  const target = db === null ? null : argmin(db);
  const summary =
    db === null || target === null
      ? 'No prediction yet.'
      : `Minimum ${formatDb(db[target] as number)} at ${formatGhz(freqGhz[target] as number)}.`;

  // Minimum label: below the ring when there is room (the curve never dips below its own minimum, so
  // that space is clear), otherwise beside it; beside the drop line, flipped left near the right edge.
  const mx = minGhz === null ? 0 : sx(minGhz);
  const my = minDb === null ? 0 : sy(minDb);
  const below = y1 - my > 30;
  const anchor = mx > x1 - 150 ? 'end' : 'start';
  const labelX = anchor === 'end' ? mx - (below ? 6 : 10) : mx + (below ? 6 : 10);
  const labelY = below ? my + 18 : my;
  const refLeft = minGhz !== null && mx > (x0 + x1) / 2;

  return (
    <figure className="s11-chart" aria-busy={status === 'loading' || status === 'updating'}>
      <figcaption className="s11-chart-head">
        <span className="s11-chart-title">Reflection |S11|</span>
        {status === 'updating' && <span className="s11-chart-updating">Updating…</span>}
        {status === 'error' && (
          <span className="s11-chart-error">
            Prediction failed: {error ?? 'unknown error'}
            {onRetry !== undefined && (
              <button type="button" className="s11-chart-retry" onClick={onRetry}>
                Retry
              </button>
            )}
          </span>
        )}
      </figcaption>
      <div className="s11-chart-box" ref={boxRef}>
        <svg
          className="s11-chart-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
        >
          <title id={titleId}>|S11| from 1 to 4 GHz, in dB</title>
          <desc id={descId}>{summary}</desc>
          <defs>
            <clipPath id={clipId}>
              <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
            </clipPath>
          </defs>

          <rect className="s11-plot-field" x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
          <g className="s11-grid" aria-hidden="true">
            {yTicks(bottom).map((v) => (
              <g key={`y${String(v)}`}>
                <line x1={x0} x2={x1} y1={sy(v)} y2={sy(v)} />
                <text className="s11-tick" x={x0 - 8} y={sy(v)} textAnchor="end" dominantBaseline="middle">
                  {formatTick(v)}
                </text>
              </g>
            ))}
            {xTicks().map((f) => (
              <g key={`x${String(f)}`}>
                <line x1={sx(f)} x2={sx(f)} y1={y0} y2={y1} />
                <text className="s11-tick" x={sx(f)} y={y1 + 18} textAnchor="middle">
                  {formatTick(f)}
                </text>
              </g>
            ))}
            <text className="s11-unit" x={x0 - 8} y={y0 - 2} textAnchor="end">
              dB
            </text>
            <text className="s11-unit" x={x1} y={y1 + 30} textAnchor="end">
              GHz
            </text>
          </g>

          <line className="s11-reference" x1={x0} x2={x1} y1={sy(-10)} y2={sy(-10)} aria-hidden="true" />

          {frame !== null && (
            <g clipPath={`url(#${clipId})`}>
              <path className="s11-curve" d={curvePath(frame.db, sx, sy)} />
            </g>
          )}

          {minDb !== null && minGhz !== null && (
            <g className="s11-min" aria-hidden="true">
              <line className="s11-min-drop" x1={mx} x2={mx} y1={my + 5} y2={y1} />
              <circle cx={mx} cy={my} r={4.5} />
              <text x={labelX} y={labelY} textAnchor={anchor} dominantBaseline="middle">
                {`${formatDb(minDb)} · ${formatGhz(minGhz)}`}
              </text>
            </g>
          )}

          {/* The −10 dB label sits at the end of the line away from the minimum marker, drawn on top. */}
          <text
            className="s11-reference-label"
            x={refLeft ? x0 + 6 : x1 - 6}
            y={sy(-10) - 7}
            textAnchor={refLeft ? 'start' : 'end'}
            aria-hidden="true"
          >
            {REFERENCE_LABEL}
          </text>

          {frame === null && (
            <text className="s11-chart-placeholder" x={(x0 + x1) / 2} y={(y0 + y1) / 2} textAnchor="middle">
              {status === 'error' ? 'No prediction' : status === 'loading' ? 'Loading model…' : 'Predicting…'}
            </text>
          )}
        </svg>
      </div>
    </figure>
  );
}
