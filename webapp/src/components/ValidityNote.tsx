/**
 * Domain-of-validity note (PRODUCT.md "Honest scope over impressive output"): what the model learned,
 * where it may not hold, that it is a surrogate, and the selected grid's test error from
 * meta.json → scope.test. Calm, factual; links only to the repository (the paper is under review and
 * is not cited, PRODUCT.md).
 */
import { useId } from 'react';
import type { ModelMeta } from '../model/meta';
import './ValidityNote.css';

export const REPOSITORY_URL = 'https://github.com/asparagusD/graphpatch';

export interface ValidityNoteProps {
  N: number;
  scope: ModelMeta['scope'];
}

export function ValidityNote({ N, scope }: ValidityNoteProps) {
  const headingId = useId();
  const test = scope.test[String(N)];
  const grid = `${String(N)}×${String(N)}`;
  const balanced = test !== undefined && test.test_set.toLowerCase().includes('balanced');

  return (
    <section className="validity" aria-labelledby={headingId}>
      <h2 className="validity-heading" id={headingId}>
        About this prediction
      </h2>
      <p>
        GraphPatch is a surrogate model, not a full-wave simulation: use it to explore, then verify a design
        in a simulator. It learned from randomly generated pixel antennas on five grid sizes, over 1–4 GHz,
        always with the same patch size and feed position.
      </p>
      <p>
        On 12×12, 15×15, 35×35 and 45×45 it saw only single-band and non-functioning antennas. Hand-drawn
        shapes may be unlike anything in its training data.
      </p>
      {test !== undefined && (
        <p className="validity-metric">
          {`Test error on ${grid}: ${test.test_mae_db.toFixed(2)} dB mean absolute error over ${test.n_test.toLocaleString('en-US')} test antennas${balanced ? ' (single-band and non-functioning only)' : ''}.`}
        </p>
      )}
      <p>
        <a className="validity-link" href={REPOSITORY_URL}>
          Source code and training notebooks on GitHub
        </a>
      </p>
    </section>
  );
}
