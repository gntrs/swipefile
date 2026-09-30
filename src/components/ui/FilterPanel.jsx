import React, { useEffect, useId, useRef } from 'react';
import { Funnel } from '@phosphor-icons/react';
import { Button } from './Button';
import Sheet from './Sheet';
import { useIsDesktop } from './useMedia';

// Filters behind one button. A bottom sheet on a phone, a popover under the
// trigger from lg. Both carry role="dialog" and data-sheet="filters", which
// pauses the library shortcuts while they are open. Changes apply at once:
// Done only closes.
export function FilterPanel({ count = 0, open, onOpenChange, onClear, children, label = 'Filters', className = '' }) {
  const desktop = useIsDesktop();
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const titleId = useId();
  const close = () => onOpenChange?.(false);
  const closeRef = useRef(close);
  closeRef.current = close;

  // Popover only: outside click and Escape close it, focus goes in on open
  // and back to the trigger on close.
  useEffect(() => {
    if (!open || !desktop) return undefined;
    const trigger = triggerRef.current;
    const first = popRef.current?.querySelector('button, input, select, textarea, a[href]');
    (first || popRef.current)?.focus({ preventScroll: true });
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) closeRef.current();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeRef.current();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, [open, desktop]);

  const footer = (
    <>
      {onClear && (
        <Button variant="ghost" onClick={onClear} className="mr-auto -ml-3">
          Clear all
        </Button>
      )}
      <Button variant="primary" onClick={close}>
        Done
      </Button>
    </>
  );
  const body = <div className="flex flex-col gap-5">{children}</div>;

  return (
    <div ref={wrapRef} className={`relative flex-shrink-0 ${className}`}>
      <Button
        ref={triggerRef}
        variant="secondary"
        icon={Funnel}
        aria-haspopup="dialog"
        aria-expanded={Boolean(open)}
        onClick={() => onOpenChange?.(!open)}
      >
        {label}
        {count > 0 && <span className="num text-small">{count}</span>}
      </Button>
      {desktop && open && (
        <div
          ref={popRef}
          role="dialog"
          aria-labelledby={titleId}
          data-sheet="filters"
          tabIndex={-1}
          className="absolute right-0 top-full mt-2 z-40 w-[22rem] max-h-[min(70vh,40rem)] overflow-y-auto bg-card border border-line rounded-xl3 shadow-cardhover outline-none"
        >
          <h2 id={titleId} className="text-title text-ink px-5 pt-5 mb-4">
            {label}
          </h2>
          <div className="px-5 pb-4">{body}</div>
          <div className="sticky bottom-0 flex items-center justify-end gap-2 bg-card border-t border-line px-5 py-3">{footer}</div>
        </div>
      )}
      {!desktop && (
        <Sheet open={open} onClose={close} title={label} sheetId="filters" footer={footer}>
          {body}
        </Sheet>
      )}
    </div>
  );
}

// One group inside the filter panel: a label over its controls.
export function FilterGroup({ label, children, className = '' }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={className}>
      <p id={id} className="text-small font-medium text-ink mb-2">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export default FilterPanel;
