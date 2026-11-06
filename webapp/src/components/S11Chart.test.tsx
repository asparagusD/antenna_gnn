import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { freqGhz } from '../core/analysis';
import { S11Chart } from './S11Chart';

/** A single dip of -18.4 dB at sample 91 (2.365 GHz), -2 dB elsewhere. */
function dip(depth = -18.4, at = 91): Float64Array {
  return Float64Array.from(freqGhz, (_, k) => -2 + (depth + 2) * Math.exp(-(((k - at) / 6) ** 2)));
}

const curvePath = (container: HTMLElement) => container.querySelector('path.s11-curve');

describe('S11Chart', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(cleanup);

  it('draws the curve with GHz and dB axes, the labelled -10 dB line and the minimum', () => {
    const { container } = render(<S11Chart db={dip()} status="ready" />);
    expect(curvePath(container)?.getAttribute('d')).toMatch(/^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+){200}$/);
    for (const label of [
      '1',
      '1.5',
      '2',
      '2.5',
      '3',
      '3.5',
      '4',
      'GHz',
      '0',
      '−5',
      '−10',
      '−15',
      '−20',
      'dB',
    ])
      expect(screen.getAllByText(label, { selector: 'text' }).length).toBeGreaterThan(0);
    expect(screen.getByText('−10 dB', { selector: 'text' })).toBeDefined();
    expect(screen.getByText('−18.4 dB · 2.365 GHz', { selector: 'text' })).toBeDefined();
    // "|S11|" is spoken as "S11 magnitude", not "vertical bar S 11 vertical bar".
    const img = screen.getByRole('img', { name: /^S11 magnitude from 1 to 4 GHz, in dB/ });
    expect(img.textContent).toContain('Minimum −18.4 dB at 2.365 GHz');
  });

  it('numbers every band above the plot when there are two or more, matching the table', () => {
    const twoBands = Float64Array.from(
      freqGhz,
      (_, k) => -2 + (dip(-16, 60)[k] ?? 0) + 2 + (dip(-12, 150)[k] ?? 0) + 2,
    );
    const { container, rerender } = render(<S11Chart db={dip()} status="ready" />);
    expect(container.querySelectorAll('.s11-band')).toHaveLength(0); // one band: the minimum marker is enough
    rerender(<S11Chart db={twoBands} status="ready" />);
    const marks = Array.from(container.querySelectorAll('.s11-band'));
    expect(marks.map((m) => m.textContent)).toEqual(['1', '2']);
    const xs = marks.map((m) => Number(m.querySelector('line')?.getAttribute('x1')));
    expect(xs[0]).toBeLessThan(xs[1] ?? 0);
    expect(screen.getByRole('img').textContent).toContain('2 bands below −10 dB');
  });

  it('auto-ranges the y axis: bottom floored to 5 dB below the minimum', () => {
    const { rerender } = render(<S11Chart db={dip(-18.4)} status="ready" />);
    expect(screen.queryByText('−25', { selector: 'text' })).toBeNull();
    rerender(<S11Chart db={dip(-31)} status="ready" />);
    expect(screen.getByText('−35', { selector: 'text' })).toBeDefined();
  });

  it('shows the loading state on empty axes before the first curve', () => {
    const { container } = render(<S11Chart db={null} status="loading" />);
    expect(curvePath(container)).toBeNull();
    expect(screen.getByText('Loading model…')).toBeDefined();
    expect(screen.getByText('−30', { selector: 'text' })).toBeDefined();
  });

  it('keeps the previous curve while a new prediction is running, and marks it as updating', () => {
    const db = dip();
    const { container, rerender } = render(<S11Chart db={db} status="ready" />);
    const before = curvePath(container)?.getAttribute('d');
    expect(screen.queryByText('Updating…')).toBeNull();
    rerender(<S11Chart db={db} status="updating" />);
    expect(curvePath(container)?.getAttribute('d')).toBe(before);
    // Revealed by CSS after a short delay (s11-chart-updating), so fast edits do not flicker.
    expect(screen.getByText('Updating…').className).toContain('s11-chart-updating');
  });

  it('a new curve changes the path', () => {
    const { container, rerender } = render(<S11Chart db={dip(-18.4, 91)} status="ready" />);
    const before = curvePath(container)?.getAttribute('d');
    rerender(<S11Chart db={dip(-14, 120)} status="ready" />);
    expect(curvePath(container)?.getAttribute('d')).not.toBe(before);
  });

  it('puts the −10 dB label at the end of the line away from the minimum, drawn on top', () => {
    const label = () => screen.getByText('−10 dB', { selector: 'text' });
    const lineEnds = (container: HTMLElement) => {
      const line = container.querySelector('line.s11-reference');
      return [Number(line?.getAttribute('x1')), Number(line?.getAttribute('x2'))] as const;
    };
    // Minimum near 4 GHz (sample 190 = 3.85 GHz, the default 25×25 start): label at the left end.
    const { container, rerender } = render(<S11Chart db={dip(-3, 190)} status="ready" />);
    const [left, right] = lineEnds(container);
    expect(label().getAttribute('text-anchor')).toBe('start');
    expect(Number(label().getAttribute('x'))).toBeLessThan(left + 20);
    // Minimum near 1 GHz: label at the right end.
    rerender(<S11Chart db={dip(-12, 10)} status="ready" />);
    expect(label().getAttribute('text-anchor')).toBe('end');
    expect(Number(label().getAttribute('x'))).toBeGreaterThan(right - 20);
    // Drawn after the curve and the minimum marker, so nothing runs over it.
    const order = Array.from(container.querySelectorAll('.s11-curve, .s11-min, .s11-reference-label'));
    expect(order.at(-1)?.textContent).toBe('−10 dB');
  });

  it('shows an error with Retry and keeps the last curve', () => {
    const onRetry = vi.fn();
    const { container } = render(
      <S11Chart db={dip()} status="error" error="the model failed to load" onRetry={onRetry} />,
    );
    expect(curvePath(container)).not.toBeNull();
    expect(screen.getByText(/the model failed to load/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
