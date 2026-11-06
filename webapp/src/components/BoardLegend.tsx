/**
 * Board legend (C6.5): what the board's marks mean, visible without hovering, with swatches drawn from
 * the same tokens as the canvas (live copper, floating copper with a dashed edge, hatched seed, feed
 * ring) and one line on how to paint.
 */
import './BoardLegend.css';

const S = 12; // swatch size in px

export function BoardLegend() {
  return (
    <div className="board-legend">
      <ul className="board-legend-list" aria-label="Board legend">
        <li>
          <svg width={S} height={S} viewBox="0 0 12 12" aria-hidden="true">
            <rect className="legend-live" width="12" height="12" />
          </svg>
          Copper connected to the feed
        </li>
        <li>
          <svg width={S} height={S} viewBox="0 0 12 12" aria-hidden="true">
            <rect className="legend-floating" width="12" height="12" />
            <rect className="legend-dash" x="1" y="1" width="10" height="10" />
          </svg>
          Not connected (dashed edge)
        </li>
        <li>
          <svg width={S} height={S} viewBox="0 0 12 12" aria-hidden="true">
            <rect className="legend-live" width="12" height="12" />
            <path className="legend-hatch" d="M-1 4 4 -1 M-1 9 9 -1 M3 13 13 3 M8 13 13 8" />
          </svg>
          Seed pixel, always metal
        </li>
        <li>
          <svg width={S} height={S} viewBox="0 0 12 12" aria-hidden="true">
            <circle className="legend-feed" cx="6" cy="6" r="4" />
          </svg>
          Feed
        </li>
      </ul>
      <p className="board-legend-hint">Click or drag to paint; keyboard: arrows move, Space toggles.</p>
    </div>
  );
}
