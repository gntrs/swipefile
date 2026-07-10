import React, { useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';

// Phone-only collapsible section. On sm+ screens the strip is hidden and the
// content always shows (desktop has room; folding there just hides data). On
// phones every dashboard section gets a slim tap-to-fold strip so the page is
// scannable without endless scrolling. Open state persists per section id.
export default function Fold({ id, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(`fold:${id}`);
      return v == null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(`fold:${id}`, next ? '1' : '0');
      } catch {
        /* private mode etc. - just don't persist */
      }
      return next;
    });

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="sm:hidden w-full flex items-center justify-between px-1 pt-1 pb-2 select-none"
      >
        <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-soft">
          {title}
        </span>
        <CaretDown
          size={14}
          weight="bold"
          className={`text-ink-soft transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      <div className={`${open ? 'block' : 'hidden'} sm:block`}>{children}</div>
    </section>
  );
}
