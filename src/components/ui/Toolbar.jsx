import React, { forwardRef } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';

// The search and filter row above a list or grid.
// Desktop (lg): one row, the search takes the free width, the controls follow.
// Phone: the search on its own row, the controls on a second row that scrolls
// sideways and never wraps. `sticky` pins that second row to the top of the
// scroller under lg (the root uses display: contents there, so the sticky row
// belongs to the page, not to this short wrapper).
export function Toolbar({ search, children, sticky = false, className = '' }) {
  return (
    <div className={`${sticky ? 'contents' : 'flex flex-col gap-3'} lg:flex lg:flex-row lg:items-center lg:gap-3 mb-4 lg:mb-6 ${className}`}>
      {search && <div className={`min-w-0 lg:flex-1 ${sticky ? 'block mb-3 lg:mb-0' : ''}`}>{search}</div>}
      {children && (
        <div
          className={`scroll-x flex items-center gap-2 min-w-0 lg:!overflow-visible lg:flex-shrink-0 ${
            sticky ? 'sticky top-0 z-30 -mx-[var(--gutter)] px-[var(--gutter)] py-2 mb-4 bg-canvas/95 lg:static lg:mx-0 lg:px-0 lg:py-0 lg:mb-0 lg:bg-transparent' : ''
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// The search box. onChange gets the string, not the event. The ref (or
// inputRef) reaches the input, so keyboard shortcuts can focus it.
export const SearchField = forwardRef(function SearchField(
  { value, onChange, placeholder, label, inputRef, className = '', ...rest },
  ref
) {
  const setRef = (el) => {
    for (const r of [ref, inputRef]) {
      if (typeof r === 'function') r(el);
      else if (r) r.current = el;
    }
  };
  return (
    <label className={`relative flex items-center min-w-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <MagnifyingGlass size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 text-ink-soft" />
      <input
        ref={setRef}
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="w-full min-h-[44px] rounded-xl bg-white/[0.03] border border-line pl-10 pr-3.5 text-ui text-ink placeholder:text-ink-soft transition-colors"
        {...rest}
      />
    </label>
  );
});

export default Toolbar;
