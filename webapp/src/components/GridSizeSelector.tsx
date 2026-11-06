/**
 * Grid-size segmented control (DESIGN.md "Navigation"): square segments, the current size filled
 * with the action colour. Each size is a toggle button (aria-pressed), one tab stop each.
 *
 * Changing size starts a fresh grid. When the pattern has edits, the control asks first in an inline,
 * non-modal question under the segments (no dialog: DESIGN.md bans modals for routine states); focus
 * moves to its confirm button, and Keep or Escape returns focus to the size that was chosen.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import './GridSizeSelector.css';

export interface GridSizeSelectorProps {
  sizes: readonly number[];
  value: number;
  /** Whether the current pattern differs from a fresh grid (then a change asks first). */
  edited: boolean;
  onChange: (size: number) => void;
}

const label = (n: number) => `${String(n)}×${String(n)}`;

export function GridSizeSelector({ sizes, value, edited, onChange }: GridSizeSelectorProps) {
  // The question remembers the size it was asked from, so it closes by itself once the size changes.
  const [asked, setAsked] = useState<{ size: number; from: number } | null>(null);
  const pending = asked !== null && asked.from === value ? asked.size : null;
  const questionId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const segmentRefs = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    if (pending !== null) confirmRef.current?.focus();
  }, [pending]);

  const choose = (size: number) => {
    if (size === value) setAsked(null);
    else if (edited) setAsked({ size, from: value });
    else onChange(size);
  };

  const cancel = () => {
    if (pending === null) return;
    segmentRefs.current.get(pending)?.focus();
    setAsked(null);
  };

  const onQuestionKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <div className="grid-size">
      <div className="grid-size-segments" role="group" aria-label="Grid size">
        {sizes.map((size) => (
          <button
            key={size}
            ref={(element) => {
              if (element === null) segmentRefs.current.delete(size);
              else segmentRefs.current.set(size, element);
            }}
            type="button"
            className="grid-size-segment"
            aria-pressed={size === value}
            onClick={() => {
              choose(size);
            }}
          >
            {label(size)}
          </button>
        ))}
      </div>
      {pending !== null && (
        <div
          className="grid-size-question"
          role="group"
          aria-labelledby={questionId}
          onKeyDown={onQuestionKey}
        >
          <p className="grid-size-question-text">
            <strong id={questionId}>Switch to {label(pending)}?</strong> Your {label(value)} edits will be
            cleared, and undo cannot bring them back.
          </p>
          <div className="grid-size-question-actions">
            <button
              ref={confirmRef}
              type="button"
              className="grid-size-confirm"
              onClick={() => {
                onChange(pending);
              }}
            >
              Switch to {label(pending)}
            </button>
            <button type="button" className="grid-size-keep" onClick={cancel}>
              Keep {label(value)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
