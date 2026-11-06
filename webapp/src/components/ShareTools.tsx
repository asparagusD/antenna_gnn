/**
 * Share and export row under the results (C5.5). The address bar always holds the share link (App keeps
 * the URL hash in sync with the board, share.ts); "Copy share link" copies it. The outcome is shown and
 * announced politely; if the clipboard is unavailable the message points to the address bar.
 */
import { useState, type ReactNode } from 'react';
import './ShareTools.css';

export interface ShareToolsProps {
  /** Further actions in the same row (the CSV downloads). */
  children?: ReactNode;
}

export function ShareTools({ children }: ShareToolsProps) {
  const [message, setMessage] = useState('');

  const copy = () => {
    const url = window.location.href;
    const done = () => {
      setMessage('Link copied. It restores this exact pattern.');
    };
    const failed = () => {
      setMessage('Could not copy. The address bar holds the share link.');
    };
    if (typeof navigator.clipboard === 'undefined') {
      failed();
      return;
    }
    navigator.clipboard.writeText(url).then(done, failed);
  };

  return (
    <div className="share-tools">
      <div className="share-tools-row" role="toolbar" aria-label="Share and export">
        <button type="button" className="tool" onClick={copy}>
          Copy share link
        </button>
        {children}
      </div>
      <p className="share-tools-status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
