/**
 * Post-processing of a predicted |S11| curve (C4.4): minimum, functioning verdict, bands and their
 * -10 dB bandwidth. Pure functions, no DOM.
 *
 * Rules (Chunk 51, which built the deployed model's data; CLAUDE.md domain facts):
 * - functioning: min(dB) < -10 (strict);
 * - bands: scipy.signal.find_peaks(-dB, height=10, prominence=3, distance=10). bandIndices() ports
 *   scipy's stages exactly: local maxima with plateau midpoints, height filter, distance filter by
 *   priority (highest peak first), then prominence with bases searched over the whole curve.
 *   find_peaks never reports the first or last sample, so a minimum at 1 or 4 GHz is not a band.
 * Exact parity with scipy is tested on 240 synthetic curves (fixtures/analysis/band_vectors.json).
 */

export const NUM_FREQ = 201;
export const FUNCTIONING_DB = -10;
export const BAND_RULE = { height: 10, prominence: 3, distance: 10 } as const;

/** np.linspace(1, 4, 201): start + k * step, with the last value set exactly to stop. */
export const freqGhz: Float64Array = (() => {
  const step = (4 - 1) / (NUM_FREQ - 1);
  const f = Float64Array.from({ length: NUM_FREQ }, (_, k) => 1 + k * step);
  f[NUM_FREQ - 1] = 4;
  return f;
})();

export interface Band {
  /** Sample index (0..200) of the dip. */
  index: number;
  freqGhz: number;
  depthDb: number;
  /** scipy prominence of the dip in -dB. */
  prominenceDb: number;
  /** -10 dB bandwidth in MHz between the interpolated crossings (0 for a dip of exactly -10 dB). */
  bandwidthMhz: number;
  lowGhz: number;
  highGhz: number;
  /** The curve is still below -10 dB at the 1 GHz / 4 GHz edge: the bandwidth is a lower bound. */
  clippedLow: boolean;
  clippedHigh: boolean;
}

export interface Analysis {
  minDb: number;
  minIndex: number;
  minFreqGhz: number;
  /** The minimum sits on the first or last sample (no band can be reported there). */
  minAtEdge: boolean;
  functioning: boolean;
  bands: Band[];
}

function checkCurve(db: ArrayLike<number>): void {
  if (db.length !== NUM_FREQ) throw new RangeError(`expected ${NUM_FREQ} values, got ${db.length}`);
  for (let k = 0; k < NUM_FREQ; k++) {
    if (!Number.isFinite(db[k])) throw new RangeError(`value ${k} is not finite`);
  }
}

const at = (x: ArrayLike<number>, k: number): number => x[k] as number;

/** scipy.signal._peak_finding_utils._local_maxima_1d: peak midpoints, plateaus included. */
function localMaxima(x: ArrayLike<number>): number[] {
  const peaks: number[] = [];
  const iMax = x.length - 1;
  let i = 1;
  while (i < iMax) {
    if (at(x, i - 1) < at(x, i)) {
      let ahead = i + 1;
      while (ahead < iMax && at(x, ahead) === at(x, i)) ahead++;
      if (at(x, ahead) < at(x, i)) {
        peaks.push(Math.floor((i + ahead - 1) / 2));
        i = ahead;
      }
    }
    i++;
  }
  return peaks;
}

/** scipy _select_by_peak_distance: keep the highest peaks, drop neighbours closer than `distance`. */
function selectByDistance(peaks: number[], x: ArrayLike<number>, distance: number): number[] {
  const keep = peaks.map(() => true);
  // np.argsort of the heights; stable for the handful of peaks that survive the height filter.
  const order = peaks.map((_, j) => j).sort((a, b) => at(x, peaks[a] as number) - at(x, peaks[b] as number));
  for (let i = order.length - 1; i >= 0; i--) {
    const j = order[i] as number;
    if (!keep[j]) continue;
    const pj = peaks[j] as number;
    for (let k = j - 1; k >= 0 && pj - (peaks[k] as number) < distance; k--) keep[k] = false;
    for (let k = j + 1; k < peaks.length && (peaks[k] as number) - pj < distance; k++) keep[k] = false;
  }
  return peaks.filter((_, j) => keep[j]);
}

/** scipy _peak_prominences with no window: bases searched over the whole curve. */
function prominence(x: ArrayLike<number>, peak: number): number {
  const top = at(x, peak);
  let leftMin = top;
  for (let i = peak; i >= 0 && at(x, i) <= top; i--) leftMin = Math.min(leftMin, at(x, i));
  let rightMin = top;
  for (let i = peak; i < x.length && at(x, i) <= top; i++) rightMin = Math.min(rightMin, at(x, i));
  return top - Math.max(leftMin, rightMin);
}

interface Peak {
  index: number;
  prominence: number;
}

function findBandPeaks(db: ArrayLike<number>): Peak[] {
  checkCurve(db);
  const x = Float64Array.from(db, (v) => -v);
  const high = localMaxima(x).filter((p) => at(x, p) >= BAND_RULE.height);
  return selectByDistance(high, x, Math.ceil(BAND_RULE.distance))
    .map((index) => ({ index, prominence: prominence(x, index) }))
    .filter((p) => p.prominence >= BAND_RULE.prominence);
}

/** Indices of the band dips, exactly as scipy.signal.find_peaks(-db, height=10, prominence=3, distance=10). */
export function bandIndices(db: ArrayLike<number>): number[] {
  return findBandPeaks(db).map((p) => p.index);
}

/** -10 dB crossing on one side of a dip, linearly interpolated between samples. */
function crossing(
  db: ArrayLike<number>,
  freq: ArrayLike<number>,
  index: number,
  step: -1 | 1,
): { ghz: number; clipped: boolean } {
  let k = index;
  const last = step === -1 ? 0 : NUM_FREQ - 1;
  while (k !== last && at(db, k + step) < FUNCTIONING_DB) k += step;
  if (k === last) return { ghz: at(freq, last), clipped: true };
  const outer = k + step; // first sample at or above -10 dB
  const t = (FUNCTIONING_DB - at(db, outer)) / (at(db, k) - at(db, outer));
  return { ghz: at(freq, outer) + t * (at(freq, k) - at(freq, outer)), clipped: false };
}

function describeBand(db: ArrayLike<number>, freq: ArrayLike<number>, peak: Peak): Band {
  const { index } = peak;
  const depthDb = at(db, index);
  const base = { index, freqGhz: at(freq, index), depthDb, prominenceDb: peak.prominence };
  if (!(depthDb < FUNCTIONING_DB)) {
    // A dip of exactly -10 dB passes find_peaks' height test but has no width below -10 dB.
    const f = at(freq, index);
    return { ...base, bandwidthMhz: 0, lowGhz: f, highGhz: f, clippedLow: false, clippedHigh: false };
  }
  const low = crossing(db, freq, index, -1);
  const high = crossing(db, freq, index, 1);
  return {
    ...base,
    bandwidthMhz: (high.ghz - low.ghz) * 1000,
    lowGhz: low.ghz,
    highGhz: high.ghz,
    clippedLow: low.clipped,
    clippedHigh: high.clipped,
  };
}

/** Minimum, functioning verdict and bands of a 201-point |S11| curve in dB. */
export function analyse(db: ArrayLike<number>, freq: ArrayLike<number> = freqGhz): Analysis {
  checkCurve(db);
  if (freq.length !== NUM_FREQ) throw new RangeError(`expected ${NUM_FREQ} frequencies, got ${freq.length}`);
  let minIndex = 0;
  for (let k = 1; k < NUM_FREQ; k++) if (at(db, k) < at(db, minIndex)) minIndex = k; // first minimum, as np.argmin
  const minDb = at(db, minIndex);
  return {
    minDb,
    minIndex,
    minFreqGhz: at(freq, minIndex),
    minAtEdge: minIndex === 0 || minIndex === NUM_FREQ - 1,
    functioning: minDb < FUNCTIONING_DB,
    bands: findBandPeaks(db).map((peak) => describeBand(db, freq, peak)),
  };
}
