/**
 * Grid-size segmented control (DESIGN.md "Navigation"): square segments, the current size filled
 * with the action colour. Each size is a toggle button (aria-pressed), one tab stop each.
 *
 * Changing size starts a fresh grid. When the pattern has edits, the control asks first in an inline,
 * non-modal question under the segments (no dialog: DESIGN.md bans modals for routine states):
 * - "Keep" is the primary button and takes focus, so a stray Enter keeps the work; the cost is the
 *   question's accessible description.
 * - Keep, Escape (from the question or the segments) or a press anywhere outside closes it; it also
 *   closes by itself once the pattern is no longer edited (e.g. after undo).
 * - After a switch, focus moves to the new size and a polite live region announces it.
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
  const pending = asked !== null && asked.from === value && edited ? asked.size : null;
  const [announcement, setAnnouncement] = useState('');
  const questionId = useId();
  const costId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const segmentRefs = useRef(new Map<number, HTMLButtonElement>());
  const focusAfterSwitch = useRef<number | null>(null);

  useEffect(() => {
    if (pending !== null) keepRef.current?.focus();
  }, [pending]);

  // Once the parent has applied a confirmed switch, put focus on the new size.
  useEffect(() => {
    if (focusAfterSwitch.current === value) {
      segmentRefs.current.get(value)?.focus();
      focusAfterSwitch.current = null;
    }
  }, [value]);

  // A press anywhere outside the control closes the question (counts as Keep).
  useEffect(() => {
    if (pending === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !rootRef.current?.contains(event.target)) setAsked(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [pending]);

  const switchTo = (size: number) => {
    focusAfterSwitch.current = size;
    setAsked(null);
    setAnnouncement(`Switched to ${label(size)}: example antenna loaded.`);
    onChange(size);
  };

  const choose = (size: number) => {
    if (size === value) setAsked(null);
    else if (edited) setAsked({ size, from: value });
    else switchTo(size);
  };

  const cancel = () => {
    if (pending === null) return;
    segmentRefs.current.get(value)?.focus();
    setAsked(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && pending !== null) {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <div className="grid-size" ref={rootRef} onKeyDown={onKeyDown}>
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
      <p className="grid-size-announcement" aria-live="polite">
        {announcement}
      </p>
      {pending !== null && (
        <div
          className="grid-size-question"
          role="group"
          aria-labelledby={questionId}
          aria-describedby={costId}
        >
          <p className="grid-size-question-text">
            <strong id={questionId}>Switch to {label(pending)}?</strong>{' '}
            <span id={costId}>
              Your {label(value)} edits will be cleared, and undo cannot bring them back.
            </span>
          </p>
          <div className="grid-size-question-actions">
            <button ref={keepRef} type="button" className="grid-size-keep" onClick={cancel}>
              Keep {label(value)}
            </button>
            <button
              type="button"
              className="grid-size-confirm"
              onClick={() => {
                switchTo(pending);
              }}
            >
              Switch to {label(pending)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
