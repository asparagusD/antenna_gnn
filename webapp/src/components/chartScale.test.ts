import { describe, expect, it } from 'vitest';
import { freqGhz } from '../core/analysis';
import {
  DEFAULT_BOTTOM_DB,
  TOP_DB,
  curvePath,
  easeOut,
  formatDb,
  formatGhz,
  lerpCurve,
  linear,
  xTicks,
  yBottom,
  yTicks,
} from './chartScale';

describe('yBottom (auto range, floored to 5 dB)', () => {
  it.each([
    [-12.3, -15],
    [-17.9, -20],
    [-20, -25], // strictly below the minimum, so the curve never sits on the frame
    [-20.01, -25],
    [-33.2, -35],
    [-48.7, -50],
  ])('minimum %s dB -> bottom %s dB', (minDb, bottom) => {
    expect(yBottom(minDb)).toBe(bottom);
  });

  it.each([-0.4, -3, -9.99, -10, -14.9])(
    'never above -15 dB, so the -10 dB line always fits (minimum %s dB)',
    (minDb) => {
      expect(yBottom(minDb)).toBe(-15);
    },
  );

  it('uses -30 dB while there is no curve yet', () => {
    expect(yBottom(null)).toBe(DEFAULT_BOTTOM_DB);
    expect(DEFAULT_BOTTOM_DB).toBe(-30);
  });

  it('the top is fixed at +1 dB', () => {
    expect(TOP_DB).toBe(1);
  });

  it('rejects a non-finite minimum', () => {
    expect(() => yBottom(Number.NaN)).toThrow(RangeError);
  });
});

describe('yTicks', () => {
  it('every 5 dB from the bottom to 0 dB', () => {
    expect(yTicks(-15)).toEqual([-15, -10, -5, 0]);
    expect(yTicks(-30)).toEqual([-30, -25, -20, -15, -10, -5, 0]);
  });

  it('every 10 dB once the range passes 50 dB, still including -10 and 0', () => {
    expect(yTicks(-60)).toEqual([-60, -50, -40, -30, -20, -10, 0]);
  });
});

describe('xTicks', () => {
  it('1 to 4 GHz every 0.5 GHz', () => {
    expect(xTicks()).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4]);
  });
});

describe('linear', () => {
  it('maps the domain onto the range, either direction', () => {
    const sx = linear([1, 4], [0, 300]);
    expect(sx(1)).toBe(0);
    expect(sx(2.5)).toBe(150);
    expect(sx(4)).toBe(300);
    const sy = linear([-15, 1], [160, 0]); // SVG y grows downwards
    expect(sy(1)).toBe(0);
    expect(sy(-15)).toBe(160);
    expect(sy(-10)).toBe(110);
  });
});

describe('curvePath', () => {
  it('one M and 200 L commands, rounded to 0.01 px', () => {
    const db = Float64Array.from(freqGhz, (f) => -f);
    const d = curvePath(db, linear([1, 4], [0, 300]), linear([-15, 1], [160, 0]));
    expect(d.startsWith('M0,20 L1.5,20.15 ')).toBe(true);
    expect(d.match(/L/g)?.length).toBe(200);
    expect(d.endsWith('L300,50')).toBe(true);
  });

  it('a different curve gives a different path', () => {
    const sx = linear([1, 4], [0, 300]);
    const sy = linear([-15, 1], [160, 0]);
    const a = curvePath(new Float64Array(201).fill(-5), sx, sy);
    const b = curvePath(new Float64Array(201).fill(-6), sx, sy);
    expect(a).not.toBe(b);
  });
});

describe('transitions', () => {
  it('lerpCurve interpolates every point', () => {
    const a = new Float64Array(201).fill(-10);
    const b = new Float64Array(201).fill(-20);
    expect(lerpCurve(a, b, 0)[100]).toBe(-10);
    expect(lerpCurve(a, b, 0.5)[100]).toBe(-15);
    expect(lerpCurve(a, b, 1)[200]).toBe(-20);
  });

  it('easeOut starts fast, ends at 1 and is clamped', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(-1)).toBe(0);
  });
});

describe('formatting (tabular, true minus sign)', () => {
  it('formatDb uses one decimal and U+2212', () => {
    expect(formatDb(-18.43)).toBe('−18.4 dB');
    expect(formatDb(0)).toBe('0.0 dB');
  });

  it('formatGhz keeps the 15 MHz sample spacing visible (3 decimals)', () => {
    expect(formatGhz(2.365)).toBe('2.365 GHz');
    expect(formatGhz(1)).toBe('1.000 GHz');
  });
});
