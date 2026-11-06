import { FILL_HIGH, FILL_LOW, fillStatus } from '../core/grid';

const LOW_PCT = FILL_LOW * 100;
const HIGH_PCT = FILL_HIGH * 100;

/**
 * Metal fill as a percentage with one decimal ("29.9%"), never contradicting the fill warning: a fill
 * below 30% never reads "30.0%" and a fill above 80% never reads "80.0%" (e.g. 607 / 2025 = 29.975%
 * reads "29.9%", because it warns).
 */
export function fillPercentText(value: number): string {
  let pct = Math.round(value * 1000) / 10;
  const status = fillStatus(value);
  if (status === 'low') pct = Math.min(pct, LOW_PCT - 0.1);
  else if (status === 'high') pct = Math.max(pct, HIGH_PCT + 0.1);
  return `${pct.toFixed(1)}%`;
}
