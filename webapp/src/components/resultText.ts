/**
 * Text for the results panel (C5.4). dB and GHz formatting comes from chartScale.ts, so the panel and
 * the chart always print the same numbers; this adds bandwidths, ranges and times.
 */
import type { Band } from '../core/analysis';

/** −10 dB bandwidth in whole MHz; "≥" when the band runs past 1 or 4 GHz (the true width is larger). */
export function formatBandwidth(band: Band): string {
  const mhz = `${String(Math.round(band.bandwidthMhz))} MHz`;
  return band.clippedLow || band.clippedHigh ? `≥ ${mhz}` : mhz;
}

/** The −10 dB crossings: "1.947–2.054 GHz". */
export function formatRange(band: Band): string {
  return `${band.lowGhz.toFixed(3)}–${band.highGhz.toFixed(3)} GHz`;
}

export function formatMs(ms: number): string {
  return `${String(Math.round(ms))} ms`;
}
