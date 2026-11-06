import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import bandVectors from '../../fixtures/analysis/band_vectors.json';
import { analyse, freqGhz } from '../core/analysis';
import { ResultsPanel } from './ResultsPanel';
import { formatBandwidth, formatMs, formatRange } from './resultText';

/** A single dip of `depth` dB at sample `at`, -2 dB elsewhere. */
function dip(depth: number, at: number): Float64Array {
  return Float64Array.from(freqGhz, (_, k) => -2 + (depth + 2) * Math.exp(-(((k - at) / 6) ** 2)));
}

const value = (name: string) => document.querySelector(`[data-result="${name}"]`)?.textContent;

describe('result text', () => {
  const band = (bw: number, low: boolean, high: boolean) => ({
    index: 0,
    freqGhz: 2,
    depthDb: -12,
    prominenceDb: 5,
    bandwidthMhz: bw,
    lowGhz: 1.9471,
    highGhz: 2.0536,
    clippedLow: low,
    clippedHigh: high,
  });

  it('bandwidth in whole MHz, a lower bound when the band runs past 1 or 4 GHz', () => {
    expect(formatBandwidth(band(106.4, false, false))).toBe('106 MHz');
    expect(formatBandwidth(band(106.4, false, true))).toBe('≥ 106 MHz');
    expect(formatBandwidth(band(0, false, false))).toBe('0 MHz');
  });

  it('range in GHz with three decimals and an en dash', () => {
    expect(formatRange(band(106.4, false, false))).toBe('1.947–2.054 GHz');
  });

  it('time in whole milliseconds', () => {
    expect(formatMs(53.6)).toBe('54 ms');
  });
});

describe('ResultsPanel', () => {
  // Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
  afterEach(cleanup);

  it('shows dashes with units implied by labels before the first prediction', () => {
    render(<ResultsPanel db={null} inferMs={null} />);
    for (const name of ['functioning', 'resonance', 'depth', 'bands']) expect(value(name)).toBe('—');
    // The band table is always there (no layout shift as bands come and go).
    expect(screen.getByRole('table', { name: 'Bands below −10 dB' }).textContent).toContain('—');
  });

  it('a functioning single-band curve: values match analyse(), units always shown', () => {
    const db = dip(-18.4, 91);
    const a = analyse(db);
    render(<ResultsPanel db={db} inferMs={53.6} />);
    expect(value('functioning')).toBe('Yes');
    expect(value('resonance')).toBe('2.365 GHz');
    expect(value('depth')).toBe('−18.4 dB');
    expect(value('bands')).toBe('1');
    const table = screen.getByRole('table', { name: 'Bands below −10 dB' });
    const band = a.bands[0];
    if (band === undefined) throw new Error('fixture has no band');
    expect(table.textContent).toContain(formatBandwidth(band));
    expect(table.textContent).toContain(formatRange(band));
    expect(screen.getByText('Predicted in 54 ms in this browser.')).toBeDefined();
  });

  it('a non-functioning curve: No, no resonance, the minimum as depth, an empty band table', () => {
    render(<ResultsPanel db={dip(-6, 150)} inferMs={10} />);
    expect(value('functioning')).toBe('No');
    expect(value('resonance')).toBe('None');
    expect(value('depth')).toBe('−6.0 dB');
    expect(value('bands')).toBe('0');
    // The table keeps its place with an empty-state row, so content below does not jump.
    expect(screen.getByRole('table', { name: 'Bands below −10 dB' }).textContent).toContain(
      'No band below −10 dB.',
    );
    expect(screen.getByText('|S11| stays above −10 dB')).toBeDefined();
  });

  it('below −10 dB only at the 1 GHz edge: functioning, no band, and the line says why', () => {
    render(<ResultsPanel db={dip(-15, 0)} inferMs={10} />);
    expect(value('functioning')).toBe('Yes');
    expect(value('bands')).toBe('0');
    expect(value('resonance')).toBe('None');
    expect(screen.getByText('minimum |S11|, at the 1 GHz edge')).toBeDefined();
    expect(
      screen.getByText('Below −10 dB only at the 1 GHz edge; the edges are not counted as bands.'),
    ).toBeDefined();
  });

  it('exactly −10 dB is not functioning (strict min < −10)', () => {
    render(<ResultsPanel db={dip(-10, 100)} inferMs={10} />);
    expect(value('functioning')).toBe('No');
  });

  it('a multi-band curve lists every band with its bandwidth; resonance is the deepest band', () => {
    const vector = bandVectors.vectors.find((v) => v.bands.length === 2);
    if (vector === undefined) throw new Error('no 2-band vector');
    const db = Float64Array.from(vector.db);
    const a = analyse(db);
    render(<ResultsPanel db={db} inferMs={10} />);
    expect(value('bands')).toBe('2');
    const rows = screen.getAllByRole('row').slice(1); // skip the header row
    expect(rows).toHaveLength(2);
    a.bands.forEach((band, i) => {
      expect(rows[i]?.textContent).toContain(formatBandwidth(band));
    });
    const deepest = [...a.bands].sort((x, y) => x.depthDb - y.depthDb)[0];
    expect(value('resonance')).toBe(`${deepest?.freqGhz.toFixed(3) ?? ''} GHz`);
  });

  it('announces only the verdict and band count, politely', () => {
    const { container, rerender } = render(<ResultsPanel db={dip(-6, 150)} inferMs={10} />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('Not functioning: no band below −10 dB.');
    rerender(<ResultsPanel db={dip(-18.4, 91)} inferMs={10} />);
    expect(live?.textContent).toBe('Functioning: 1 band below −10 dB.');
  });
});
