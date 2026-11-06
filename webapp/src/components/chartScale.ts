/**
 * Pure scale, tick, path and format helpers for the |S11| chart (C5.3). No DOM, fully unit-tested.
 *
 * Y range (C5.3 prompt): the top is fixed at +1 dB; the bottom is the largest multiple of 5 dB strictly
 * below the curve's minimum, never above -15 dB so the -10 dB reference line and its label always fit.
 * Before the first prediction the bottom is -30 dB (DESIGN.md's default plot range).
 */
import { freqGhz as FREQ } from '../core/analysis';

export const TOP_DB = 1;
export const DEFAULT_BOTTOM_DB = -30;
const MAX_BOTTOM_DB = -15;
export const F_MIN_GHZ = 1;
export const F_MAX_GHZ = 4;

export function yBottom(minDb: number | null): number {
  if (minDb === null) return DEFAULT_BOTTOM_DB;
  if (!Number.isFinite(minDb)) throw new RangeError(`minimum must be finite, got ${String(minDb)}`);
  // Largest multiple of 5 strictly below minDb: floor, then one step lower when minDb is a multiple.
  let bottom = Math.floor(minDb / 5) * 5;
  if (bottom >= minDb) bottom -= 5;
  return Math.min(bottom, MAX_BOTTOM_DB);
}

/** Gridline values from the bottom to 0 dB: every 5 dB, or every 10 dB once the range passes 50 dB. */
export function yTicks(bottom: number): number[] {
  const step = -bottom > 50 ? 10 : 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(bottom / step) * step; v <= 0; v += step) ticks.push(v === 0 ? 0 : v);
  return ticks;
}

export function xTicks(): number[] {
  const ticks: number[] = [];
  for (let k = 0; k <= 6; k++) ticks.push(F_MIN_GHZ + k * 0.5);
  return ticks;
}

export type Scale = (value: number) => number;

/** Linear map from domain [d0, d1] to range [r0, r1]. */
export function linear([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]): Scale {
  const k = (r1 - r0) / (d1 - d0);
  return (value) => r0 + (value - d0) * k;
}

const round2 = (v: number): number => Math.round(v * 100) / 100 + 0; // + 0 turns -0 into 0

/** SVG path data for the curve: "M x,y L x,y ..." over the 201 frequencies, 0.01 px precision. */
export function curvePath(
  db: ArrayLike<number>,
  sx: Scale,
  sy: Scale,
  freq: ArrayLike<number> = FREQ,
): string {
  const parts: string[] = [];
  for (let k = 0; k < db.length; k++) {
    const x = round2(sx(freq[k] as number));
    const y = round2(sy(db[k] as number));
    parts.push(`${k === 0 ? 'M' : 'L'}${String(x)},${String(y)}`);
  }
  return parts.join(' ');
}

/** Point-wise interpolation between two curves (t = 0 gives a, t = 1 gives b). */
export function lerpCurve(a: ArrayLike<number>, b: ArrayLike<number>, t: number): Float64Array {
  const out = new Float64Array(b.length);
  for (let k = 0; k < b.length; k++) {
    const from = a[k] as number;
    out[k] = from + ((b[k] as number) - from) * t;
  }
  return out;
}

/** Exponential-style ease-out (cubic), clamped to [0, 1]. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

const MINUS = '−';

/** "−18.4 dB": one decimal, true minus sign. */
export function formatDb(value: number): string {
  const text = Math.abs(value).toFixed(1);
  return `${value < 0 && text !== '0.0' ? MINUS : ''}${text} dB`;
}

/** "2.365 GHz": three decimals, matching the 15 MHz sample spacing. */
export function formatGhz(value: number): string {
  return `${value.toFixed(3)} GHz`;
}

/** Axis tick label: "−10", "0", "1.5". */
export function formatTick(value: number): string {
  return value < 0 ? `${MINUS}${String(-value)}` : String(value);
}
