import React from 'react';
import { useLocation } from 'react-router-dom';

// The section links of a long page. It sticks under the status bar with a
// solid canvas background and one hairline, and it is always there: it never
// appears or hides on scroll. Too many links for the width scroll sideways.
// Each section carries SECTION_ANCHOR so a jump clears this bar.
//
// items: [{ id, label }], id is the section element's id.
export default function SectionNav({ label = 'On this page', items = [], className = '' }) {
  const { hash } = useLocation();
  if (!items.length) return null;
  return (
    <nav
      aria-label={label}
      className={`sticky top-[env(safe-area-inset-top)] z-30 -mx-[var(--gutter)] px-[var(--gutter)] bg-canvas border-b border-line ${className}`}
    >
      <ul className="scroll-x flex items-center gap-1 py-1 -mx-2">
        {items.map((it) => {
          const on = hash === `#${it.id}`;
          return (
            <li key={it.id} className="flex-shrink-0">
              <a
                href={`#${it.id}`}
                aria-current={on ? 'location' : undefined}
                className={`press inline-flex items-center min-h-[44px] min-w-[44px] px-2 rounded-xl text-ui font-medium whitespace-nowrap transition-colors ${
                  on ? 'text-ink' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {it.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
