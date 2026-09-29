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
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <section
        data-sheet="keys"
        aria-label={title}
        className="relative w-full sm:w-[380px] bg-card border border-line rounded-t-3xl sm:rounded-2xl px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 animate-materialize"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press w-11 h-11 -mr-1.5 rounded-full border border-line flex items-center justify-center text-ink-soft"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
          {keys.map(([k, label]) => (
            <React.Fragment key={k}>
              <dt className="font-mono text-[13px] text-ink tabular-nums whitespace-nowrap">{k}</dt>
              <dd className="text-ink-soft">{label}</dd>
            </React.Fragment>
          ))}
        </dl>
      </section>
    </div>
  );
}
