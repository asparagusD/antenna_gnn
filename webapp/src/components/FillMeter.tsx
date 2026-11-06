/**
 * Metal-fill meter (DESIGN.md: caution amber only for a fill outside 30–80%).
 *
 * Shows the live metal fraction of all N² pixels (seeds included) on a 0–100% track, with the 30–80%
 * training range drawn as a silkscreen dimension line under it. Outside the range the bar turns amber
 * and a non-blocking warning appears in words; the warning lives in a polite live region that stays
 * mounted, so screen readers hear it when it appears without being interrupted on every pixel.
 */
import { useId } from 'react';
import { FILL_HIGH, FILL_LOW, fillStatus } from '../core/grid';
import { fillPercentText } from './fillText';
import './FillMeter.css';

export const FILL_WARNING =
  'Outside the 30–80% range the model was trained on; predictions are less reliable';

const LOW_PCT = Math.round(FILL_LOW * 100);
const HIGH_PCT = Math.round(FILL_HIGH * 100);
const RANGE = `${String(LOW_PCT)}–${String(HIGH_PCT)}%`;

export interface FillMeterProps {
  /** Metal fraction in [0, 1]. */
  value: number;
}

export function FillMeter({ value }: FillMeterProps) {
  const labelId = useId();
  const status = fillStatus(value);
  const text = fillPercentText(value);
  const where =
    status === 'low'
      ? `below the ${RANGE} training range`
      : status === 'high'
        ? `above the ${RANGE} training range`
        : `inside the ${RANGE} training range`;

  return (
    <div className="fill-meter" data-status={status}>
      <div
        className="fill-meter-gauge"
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number(text.slice(0, -1))}
        aria-valuetext={`${text} metal, ${where}`}
      >
        <div className="fill-meter-head">
          <span className="fill-meter-label" id={labelId}>
            Metal fill
          </span>
          <span className="fill-meter-value">{text}</span>
        </div>
        <div className="fill-meter-track">
          <div className="fill-meter-bar" style={{ width: `${String(value * 100)}%` }} />
        </div>
        <div
          className="fill-meter-range"
          style={{ marginInlineStart: `${String(LOW_PCT)}%`, width: `${String(HIGH_PCT - LOW_PCT)}%` }}
          aria-hidden="true"
        >
          <span className="fill-meter-range-bound">{LOW_PCT}</span>
          <span className="fill-meter-range-label">training range</span>
          <span className="fill-meter-range-bound">{HIGH_PCT}</span>
        </div>
      </div>
      <div className="fill-meter-warning" aria-live="polite">
        {status !== 'ok' && (
          <>
            <svg className="fill-meter-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M8 1.75 15 14.25H1L8 1.75Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M8 6.25v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.9" r="0.9" fill="currentColor" />
            </svg>
            <span>{FILL_WARNING}</span>
          </>
        )}
      </div>
    </div>
  );
}
