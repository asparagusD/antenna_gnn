/**
 * Starting points for the board (C5.5): "Random antenna" fills the grid at the slider's fill (default
 * 60%, range 30–80%, the fill range the model was trained on) with randomPattern(); "Clear" goes back to
 * the seed pixels. Both are ordinary undoable edits, so neither asks for confirmation.
 */
import { useId, useState } from 'react';
import './PatternTools.css';

export interface PatternToolsProps {
  /** Whether the board has metal outside the seed pixels (Clear is disabled otherwise). */
  edited: boolean;
  onRandom: (fill: number) => void;
  onClear: () => void;
}

export function PatternTools({ edited, onRandom, onClear }: PatternToolsProps) {
  const [percent, setPercent] = useState(60);
  const sliderId = useId();

  return (
    <>
      <span className="pattern-random">
        <button
          type="button"
          className="tool"
          onClick={() => {
            onRandom(percent / 100);
          }}
        >
          Random antenna
        </button>
        <span className="pattern-fill">
          <label className="pattern-fill-label" htmlFor={sliderId}>
            Random fill
          </label>
          <input
            id={sliderId}
            type="range"
            min={30}
            max={80}
            step={1}
            value={percent}
            aria-valuetext={`${String(percent)}% metal`}
            onChange={(event) => {
              setPercent(Number(event.target.value));
            }}
          />
          <output className="pattern-fill-value" htmlFor={sliderId}>
            {`${String(percent)}%`}
          </output>
        </span>
      </span>
      <button type="button" className="tool" disabled={!edited} onClick={onClear}>
        Clear
      </button>
    </>
  );
}
