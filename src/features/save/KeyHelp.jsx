import React, { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { LIBRARY_HELP } from '@/lib/library/keys';

// The list of keyboard shortcuts, in a small sheet. Escape or the close button
// shuts it. Marked data-sheet="keys" so the shortcuts keep working under it.
export default function KeyHelp({ open, onClose, keys = LIBRARY_HELP, title = 'Keyboard shortcuts' }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose?.();
    };
    // Capture, so Escape closes the help before the page acts on it.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div aria-hidden="true" className="absolute inset-0 bg-black/60 animate-fade" onClick={onClose} />
      <section
        data-sheet="keys"
        aria-label={title}
        className="relative w-full sm:w-[400px] bg-card sm:border sm:border-line rounded-t-3xl sm:rounded-3xl sm:shadow-cardhover px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 animate-sheet-up sm:animate-materialize"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="kicker">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press w-11 h-11 -mr-1.5 rounded-full bg-white/[0.06] flex items-center justify-center text-ink-soft hover:text-ink"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2.5 text-[15px]">
          {keys.map(([k, label]) => (
            <React.Fragment key={k}>
              <dt className="justify-self-start font-mono text-[12px] text-ink tabular-nums whitespace-nowrap px-1.5 py-0.5 rounded bg-white/[0.08]">{k}</dt>
              <dd className="text-ink-soft">{label}</dd>
            </React.Fragment>
          ))}
        </dl>
      </section>
    </div>
  );
}
