import React from 'react';
import { selectedCls } from './controls';

// A row of mutually exclusive options (All, Ours, Rivals). Each option is a
// 44px button with aria-pressed. Scrolls sideways on its own when it does not
// fit, so it never wraps or pushes the page wider.
export default function Segmented({ options = [], value, onChange, label, className = '' }) {
  return (
    <div role="group" aria-label={label} className={`scroll-x max-w-full min-w-0 ${className}`}>
      <div className="inline-flex items-center gap-0.5 rounded-xl bg-white/[0.04] whitespace-nowrap">
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange?.(o.id)}
              className={`press inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3.5 rounded-xl text-ui font-medium transition-colors ${
                on ? selectedCls : 'text-ink-soft hover:text-ink'
              }`}
            >
              {o.label}
              {o.count != null && <span className={`num text-small ${on ? 'text-ink' : 'text-ink-soft'}`}>{o.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
