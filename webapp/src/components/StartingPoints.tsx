/**
 * Starting points (C5.5, moved to the top bar in C6.1 as the approved shape planned): a disclosure that
 * opens a small non-modal panel with "Random antenna" and its fill slider (default 60%, range 30–80%, the
 * fill range the model was trained on). Every action is an ordinary undoable edit, so none confirms.
 *
 * Keyboard: the toggle has aria-expanded; opening focuses the panel's first action; Escape or a press
 * outside closes it, and closing returns focus to the toggle.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import './StartingPoints.css';

export interface StartingPointsProps {
  onRandom: (fill: number) => void;
}

export function StartingPoints({ onRandom }: StartingPointsProps) {
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState(60);
  const panelId = useId();
  const sliderId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="starting-points" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={toggleRef}
        type="button"
        className="tool starting-points-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        Starting points
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="starting-points-panel"
          role="group"
          aria-label="Starting points"
        >
          <div className="starting-points-random">
            <button
              type="button"
              className="tool"
              onClick={() => {
                onRandom(percent / 100);
                close();
              }}
            >
              Random antenna
            </button>
            <span className="starting-points-fill">
              <label htmlFor={sliderId}>Random fill</label>
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
              {/* Visible value only: the slider's aria-valuetext already speaks it (an <output> would be
                  a second, chattering status region). */}
              <span className="starting-points-value" aria-hidden="true">
                {`${String(percent)}%`}
              </span>
            </span>
          </div>
          <p className="starting-points-note">Random patterns often do not reach −10 dB.</p>
        </div>
      )}
    </div>
  );
}
