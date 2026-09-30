import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { IconButton } from './Button';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A bottom sheet on a phone, a centred dialog from lg. Rendered into
// document.body, so no sticky row or transformed parent can trap it under the
// tab bar. Escape closes it (captured, so it closes before a page shortcut
// sees the key), focus moves in on open and goes back where it was on close.
// `dialog={false}` renders a plain labelled section instead of role="dialog",
// for the key help, which must not pause the shortcuts it lists.
export default function Sheet({ open, onClose, title, sheetId, children, footer, dialog = true, className = '' }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    const panel = panelRef.current;
    const first = panel?.querySelector(FOCUSABLE);
    (first || panel)?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !dialog || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (before && typeof before.focus === 'function' && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [open, dialog]);

  if (!open || typeof document === 'undefined') return null;

  const Tag = dialog ? 'div' : 'section';
  const roleProps = dialog ? { role: 'dialog', 'aria-modal': 'true' } : {};

  return createPortal(
    <>
      <div aria-hidden="true" className="fixed inset-0 z-[60] bg-black/60 animate-fade" onClick={() => onClose?.()} />
      <div className="fixed inset-0 z-[61] flex items-end lg:items-center justify-center pointer-events-none">
        <Tag
          ref={panelRef}
          tabIndex={-1}
          data-sheet={sheetId}
          aria-labelledby={title ? titleId : undefined}
          {...roleProps}
          className={`pointer-events-auto w-full lg:w-[28rem] max-h-[85dvh] overflow-y-auto overscroll-contain bg-card rounded-t-2xl lg:rounded-xl3 lg:shadow-cardhover outline-none animate-sheet-up lg:animate-fade ${className}`}
        >
          <div className="flex items-center justify-between gap-3 pl-5 lg:pl-6 pr-3 pt-3 pb-1">
            <h2 id={titleId} className="text-title text-ink min-w-0">
              {title}
            </h2>
            <IconButton label="Close" icon={X} onClick={() => onClose?.()} />
          </div>
          <div className={`px-5 lg:px-6 pt-2 ${footer ? 'pb-4' : 'pb-[calc(1.25rem+env(safe-area-inset-bottom))] lg:pb-6'}`}>{children}</div>
          {footer && (
            <div className="sticky bottom-0 flex items-center justify-end gap-2 bg-card border-t border-line px-5 lg:px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-4">
              {footer}
            </div>
          )}
        </Tag>
      </div>
    </>,
    document.body
  );
}
