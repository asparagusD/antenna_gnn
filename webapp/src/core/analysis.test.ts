import { describe, expect, it } from 'vitest';
import { analyse, BAND_RULE, bandIndices, freqGhz, FUNCTIONING_DB, NUM_FREQ } from './analysis';

interface BandVector {
  db: number[];
  bands: number[];
  prominences: number[];
  functioning: boolean;
}

const vectorFiles = import.meta.glob<{ vectors: BandVector[] }>('../../fixtures/analysis/band_vectors.json', {
  eager: true,
  import: 'default',
});
const bandVectors = { vectors: Object.values(vectorFiles).flatMap((f) => f.vectors) };

const IDX = Array.from({ length: NUM_FREQ }, (_, k) => k);

/** Baseline with Gaussian dips given as [index, depth dB, width in samples]. */
function curve(dips: [number, number, number][], base = -2): Float64Array {
  return Float64Array.from(IDX, (k) =>
    dips.reduce((y, [i, depth, width]) => y + (depth - base) * Math.exp(-0.5 * ((k - i) / width) ** 2), base),
  );
}

/** A V-shaped dip: depth at `centre`, rising `slope` dB per sample, capped at `base`. */
function vee(centre: number, depth: number, slope: number, base = -2): Float64Array {
  return Float64Array.from(IDX, (k) => Math.min(base, depth + slope * Math.abs(k - centre)));
}

describe('frequency grid and rule constants', () => {
  it('matches np.linspace(1, 4, 201) and the Chunk 51 rule', () => {
    expect(freqGhz).toHaveLength(201);
    expect(freqGhz[0]).toBe(1);
    expect(freqGhz[200]).toBe(4);
    expect(freqGhz[100]).toBeCloseTo(2.5, 12);
    expect(BAND_RULE).toEqual({ height: 10, prominence: 3, distance: 10 });
    expect(FUNCTIONING_DB).toBe(-10);
  });
});

describe('analyse on hand-made curves', () => {
  it('no dip: not functioning, no band, minimum reported', () => {
    const db = Float64Array.from(IDX, (k) => -3 - 2 * Math.sin((Math.PI * k) / 200));
    const result = analyse(db);
    expect(result.functioning).toBe(false);
    expect(result.bands).toEqual([]);
    expect(result.minIndex).toBe(100);
    expect(result.minDb).toBeCloseTo(-5, 12);
    expect(result.minFreqGhz).toBeCloseTo(2.5, 12);
    expect(result.minAtEdge).toBe(false);
  });

  it('one dip: functioning, one band at the dip with depth, prominence and frequency', () => {
    const result = analyse(curve([[100, -20, 3]]));
    expect(result.functioning).toBe(true);
    expect(result.bands).toHaveLength(1);
    const band = result.bands[0];
    expect(band?.index).toBe(100);
    expect(band?.freqGhz).toBeCloseTo(2.5, 12);
    expect(band?.depthDb).toBeCloseTo(-20, 12);
    expect(band?.prominenceDb).toBeCloseTo(18, 6);
  });

  it('two dips: two bands in frequency order', () => {
    const result = analyse(
      curve([
        [60, -18, 3],
        [140, -25, 4],
      ]),
    );
    expect(result.bands.map((b) => b.index)).toEqual([60, 140]);
    expect(result.minIndex).toBe(140);
  });

  it('edge-clipped minimum: functioning but no band (find_peaks never reports the endpoints)', () => {
    const db = Float64Array.from(IDX, (k) => -15 + (13 * k) / 200);
    const result = analyse(db);
    expect(result.functioning).toBe(true);
    expect(result.minIndex).toBe(0);
    expect(result.minAtEdge).toBe(true);
    expect(result.bands).toEqual([]);
  });

  it('dips closer than 10 points count once (the deeper one wins)', () => {
    expect(
      bandIndices(
        curve([
          [100, -20, 1],
          [106, -24, 1],
        ]),
      ),
    ).toEqual([106]);
  });

  it('a dip with less than 3 dB prominence is not a band', () => {
    expect(bandIndices(curve([[100, -12, 3]], -10.5))).toEqual([]);
  });

  it('functioning is strict: a flat -10 dB curve does not function', () => {
    expect(analyse(new Float64Array(NUM_FREQ).fill(-10)).functioning).toBe(false);
  });

  it('a flat-bottomed dip (plateau) reports its middle sample, as scipy does', () => {
    const db = Float64Array.from(IDX, (k) => (k >= 90 && k <= 95 ? -20 : -2));
    expect(bandIndices(db)).toEqual([92]);
  });

  it('rejects curves that are not 201 finite values', () => {
    expect(() => analyse(new Float64Array(200))).toThrow(RangeError);
    expect(() => analyse(Float64Array.from(IDX, (k) => (k === 7 ? Number.NaN : -3)))).toThrow(RangeError);
  });
});

describe('-10 dB bandwidth', () => {
  it('is the width between the interpolated -10 dB crossings, in MHz', () => {
    // V dip: -20 dB at index 100, 1 dB per sample -> crosses -10 dB 10 samples each side = 20 samples = 300 MHz.
    const band = analyse(vee(100, -20, 1)).bands[0];
    expect(band?.bandwidthMhz).toBeCloseTo(300, 9);
    expect(band?.lowGhz).toBeCloseTo(1 + 90 * 0.015, 12);
    expect(band?.highGhz).toBeCloseTo(1 + 110 * 0.015, 12);
    expect(band?.clippedLow).toBe(false);
    expect(band?.clippedHigh).toBe(false);
  });

  it('interpolates between samples', () => {
    // 2 dB per sample from -21 dB -> crossings 5.5 samples each side = 11 samples = 165 MHz.
    expect(analyse(vee(100, -21, 2)).bands[0]?.bandwidthMhz).toBeCloseTo(165, 9);
  });

  it('is flagged as clipped when the dip stays below -10 dB to the band edge', () => {
    // Below -10 dB from index 0 to 30, dip at 15: the low side runs off the 1 GHz edge.
    const db = Float64Array.from(IDX, (k) => (k <= 30 ? -14 - 6 * Math.exp(-0.5 * ((k - 15) / 3) ** 2) : -2));
    const band = analyse(db).bands[0];
    expect(band?.index).toBe(15);
    expect(band?.clippedLow).toBe(true);
    expect(band?.clippedHigh).toBe(false);
    expect(band?.lowGhz).toBe(1);
  });
});

describe('exact parity with scipy.signal.find_peaks', () => {
  const vectors = bandVectors.vectors;

  it('covers no-band and multi-band curves', () => {
    const counts = new Set(vectors.map((v) => v.bands.length));
    for (const n of [0, 1, 2, 3]) expect(counts.has(n)).toBe(true);
  });

  it.each(vectors.map((v, i) => [i, v] as const))(
    'synthetic curve %i: same bands, prominences and verdict',
    (_i, v) => {
      const result = analyse(Float64Array.from(v.db));
      expect(result.bands.map((b) => b.index)).toEqual(v.bands);
      result.bands.forEach((b, k) => {
        expect(b.prominenceDb).toBeCloseTo(v.prominences[k] ?? Number.NaN, 8);
      });
      expect(result.functioning).toBe(v.functioning);
    },
  );
});
