/**
 * Results under the chart (DESIGN.md "Result cells"): four fixed cells (Functioning, Resonance, Depth,
 * Bands), then one table row per band with its −10 dB bandwidth, then the inference time. Every
 * number carries its unit; values replace in place and never resize the row.
 *
 * All values come from analyse() (analysis.ts, the exact port of the Chunk 51 rule): functioning means
 * the minimum is strictly below −10 dB; the resonance is the deepest band's centre.
 *
 * Screen readers hear only the verdict and the band count (polite), so painting does not flood them
 * with every frequency change; the cells and table hold the detail.
 */
import { useId, useMemo } from 'react';
import { analyse, type Analysis } from '../core/analysis';
import { formatDb, formatGhz } from './chartScale';
import { formatBandwidth, formatMs, formatRange } from './resultText';
import './ResultsPanel.css';

export interface ResultsPanelProps {
  db: Float64Array | null;
  /** The worker's inference time for this curve, in ms. */
  inferMs: number | null;
}

const DASH = '—';
const edgeGhz = (a: Analysis) => (a.minFreqGhz < 2.5 ? '1 GHz' : '4 GHz');

function announcement(a: Analysis | null): string {
  if (a === null) return '';
  const n = a.bands.length;
  if (a.functioning && n === 0) return 'Functioning: below −10 dB only at the band edge.';
  const count = n === 0 ? 'no band' : `${String(n)} band${n === 1 ? '' : 's'}`;
  return `${a.functioning ? 'Functioning' : 'Not functioning'}: ${count} below −10 dB.`;
}

export function ResultsPanel({ db, inferMs }: ResultsPanelProps) {
  const a = useMemo(() => (db === null ? null : analyse(db)), [db]);
  const captionId = useId();
  const deepest = a === null ? undefined : [...a.bands].sort((x, y) => x.depthDb - y.depthDb)[0];

  const cells: { key: string; label: string; value: string; note: string }[] = [
    {
      key: 'functioning',
      label: 'Functioning',
      value: a === null ? DASH : a.functioning ? 'Yes' : 'No',
      note: a === null ? '' : a.functioning ? '|S11| drops below −10 dB' : '|S11| stays above −10 dB',
    },
    {
      key: 'resonance',
      label: 'Resonance',
      value: a === null ? DASH : deepest === undefined ? 'None' : formatGhz(deepest.freqGhz),
      note: a !== null && a.bands.length > 1 ? 'deepest band' : '',
    },
    {
      key: 'depth',
      label: 'Depth',
      value: a === null ? DASH : formatDb(a.minDb),
      note: a === null ? '' : a.minAtEdge ? `minimum |S11|, at the ${edgeGhz(a)} edge` : 'minimum |S11|',
    },
    {
      key: 'bands',
      label: 'Bands',
      value: a === null ? DASH : String(a.bands.length),
      note: a === null ? '' : 'below −10 dB',
    },
  ];

  return (
    <section className="results" aria-label="Results">
      <dl className="results-cells">
        {cells.map((cell) => (
          <div className="results-cell" key={cell.key}>
            <dt className="results-label">{cell.label}</dt>
            <dd className="results-value" data-result={cell.key}>
              {cell.value}
            </dd>
            <dd className="results-note">{cell.note}</dd>
          </div>
        ))}
      </dl>

      {a !== null && a.bands.length > 0 && (
        // A focusable, labelled scroll region: on narrow screens the table scrolls sideways, and keyboard
        // users must be able to scroll it too (WCAG 2.1.1).
        <div className="results-bands-scroll" role="region" aria-labelledby={captionId} tabIndex={0}>
          <table className="results-bands">
            <caption id={captionId}>Bands below −10 dB</caption>
            <thead>
              <tr>
                <th scope="col">Band</th>
                <th scope="col">Centre</th>
                <th scope="col">Depth</th>
                <th scope="col">−10 dB bandwidth</th>
                <th scope="col">−10 dB range</th>
              </tr>
            </thead>
            <tbody>
              {a.bands.map((band, i) => (
                <tr key={band.index}>
                  <th scope="row">{i + 1}</th>
                  <td>{formatGhz(band.freqGhz)}</td>
                  <td>{formatDb(band.depthDb)}</td>
                  <td>{formatBandwidth(band)}</td>
                  <td>{formatRange(band)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {a !== null && a.functioning && a.bands.length === 0 && (
        <p className="results-empty">
          {`Below −10 dB only at the ${edgeGhz(a)} edge; the edges are not counted as bands.`}
        </p>
      )}

      {a !== null && inferMs !== null && (
        <p className="results-foot">{`Predicted in ${formatMs(inferMs)} in this browser.`}</p>
      )}
      <p className="results-announce" aria-live="polite">
        {announcement(a)}
      </p>
    </section>
  );
}
