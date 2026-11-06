/**
 * Compact prediction summary for stacked layouts (DESIGN.md mobile: "a compact sticky result summary
 * above the board"). On phones and portrait tablets the chart sits below the board, so this one-line bar
 * stays pinned to the top while you paint: functioning verdict, resonance and depth. Pressing it scrolls
 * the chart into view (a button, not an #anchor: the URL hash holds the share link).
 *
 * Hidden by CSS in the two-column layout, where the chart is beside the board.
 */
import { useMemo } from 'react';
import { analyse } from '../core/analysis';
import type { ChartStatus } from './S11Chart';
import { formatDb, formatGhz } from './chartScale';
import './PredictionSummary.css';

export interface PredictionSummaryProps {
  db: Float64Array | null;
  status: ChartStatus;
  /** Scrolls the chart into view. */
  onShow: () => void;
}

export function PredictionSummary({ db, status, onShow }: PredictionSummaryProps) {
  const a = useMemo(() => (db === null ? null : analyse(db)), [db]);
  const deepest = a === null ? undefined : [...a.bands].sort((x, y) => x.depthDb - y.depthDb)[0];

  const verdict = a === null ? '—' : a.functioning ? 'Yes' : 'No';
  const resonance = deepest === undefined ? 'None' : formatGhz(deepest.freqGhz);
  const depth = a === null ? '—' : formatDb(a.minDb);

  return (
    // The accessible name is the visible text plus a hidden lead-in, so speech users can say what they
    // see (WCAG 2.5.3 label in name).
    <button type="button" className="summary-bar" onClick={onShow}>
      <span className="summary-hidden">Show the prediction:</span>
      <span className="summary-item">
        <span className="summary-label">Functioning</span>
        <span className="summary-value">{verdict}</span>
      </span>
      <span className="summary-item">
        <span className="summary-label">Resonance</span>
        <span className="summary-value">{a === null ? '—' : resonance}</span>
      </span>
      <span className="summary-item">
        <span className="summary-label">Depth</span>
        <span className="summary-value">{depth}</span>
      </span>
      {status === 'updating' && <span className="summary-updating">Updating…</span>}
      <svg className="summary-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
