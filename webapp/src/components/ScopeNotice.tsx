/**
 * Scope notice (DESIGN.md: calm substrate panel, muted info icon, words, no red, no motion). Shown under
 * the results whenever analyse() finds 2 or more bands in the predicted curve. It never blocks: the
 * curve and every band stay on screen. The polite live region stays mounted, so the notice is
 * announced when it appears.
 *
 * 25×25 adds one sentence: that grid was trained on the natural data, which includes multi-band
 * antennas, unlike 12/15/35/45; accuracy on multi-band antennas was never measured separately.
 */
import './ScopeNotice.css';

export const SCOPE_TEXT =
  'This prediction shows more than one band. The model was trained on single-band antennas, so multi-band predictions are less reliable.';

const SCOPE_TEXT_25 =
  'This prediction shows more than one band. Unlike the other grids, 25×25 training data included multi-band antennas, but accuracy on them was never measured separately, so treat multi-band predictions with care.';

export interface ScopeNoticeProps {
  /** Number of bands analyse() found in the predicted curve. */
  bands: number;
  N: number;
}

export function ScopeNotice({ bands, N }: ScopeNoticeProps) {
  return (
    <div className="scope-notice-live" aria-live="polite">
      {bands >= 2 && (
        <div className="scope-notice" role="note">
          <svg className="scope-notice-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 7.25v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
          </svg>
          <p>{N === 25 ? SCOPE_TEXT_25 : SCOPE_TEXT}</p>
        </div>
      )}
    </div>
  );
}
