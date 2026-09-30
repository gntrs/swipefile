import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { barPct } from '@/lib/charts';

// A horizontal bar per row, for comparing one measure across a few named
// things. One series, so no legend: the caption above names the measure, the
// unit and the period. Every bar starts at zero on the same scale, a zero
// draws no bar at all, and the value is printed as text beside the label, so
// the tooltip only adds detail and never holds the only copy of a number.
//
// rows: [{ key, label, value, display?, muted?, tip?, to?, aside? }]
// max:  the scale maximum; defaults to the largest value, so the longest bar
//       is the largest row and every other bar is its true fraction of it.
export default function BarList({ rows, max, caption, className = '' }) {
  const [hover, setHover] = useState(null);
  const top = max ?? Math.max(0, ...rows.map((r) => Number(r.value) || 0));
  return (
    <figure className={`min-w-0 ${className}`}>
      {caption && <figcaption className="text-small text-ink-soft mb-3">{caption}</figcaption>}
      <ul className="flex flex-col">
        {rows.map((r) => {
          const pct = barPct(r.value, top);
          const shown = r.display ?? String(r.value);
          const body = (
            <>
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-ui text-ink truncate min-w-0">{r.label}</span>
                <span className="flex items-baseline gap-2 flex-shrink-0">
                  {r.aside && <span className="text-small text-ink-soft whitespace-nowrap">{r.aside}</span>}
                  <span className={r.muted ? 'text-small text-ink-soft' : 'num text-ui text-ink'}>{shown}</span>
                </span>
              </span>
              <span aria-hidden="true" className="relative block h-2 mt-1.5 bg-viz-track">
                {pct > 0 && (
                  <span
                    className={`absolute inset-y-0 left-0 rounded-r-[4px] transition-colors ${
                      hover === r.key ? 'bg-viz-bar-hi' : 'bg-viz-bar'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </span>
              {r.tip && hover === r.key && (
                <span
                  role="tooltip"
                  className="absolute z-20 left-0 bottom-full mb-1 max-w-full rounded-md bg-card-hi px-2.5 py-1.5 text-small text-ink-soft shadow-cardhover pointer-events-none"
                >
                  <span className="num text-ink">{shown}</span> {r.tip}
                </span>
              )}
            </>
          );
          const cls = 'relative block py-2 min-h-[44px] -mx-2 px-2 rounded-xl';
          const on = {
            onPointerEnter: () => setHover(r.key),
            onPointerLeave: () => setHover((k) => (k === r.key ? null : k)),
            onFocus: () => setHover(r.key),
            onBlur: () => setHover((k) => (k === r.key ? null : k)),
          };
          return (
            <li key={r.key}>
              {r.to ? (
                <Link to={r.to} className={`${cls} hover:bg-white/[0.03] transition-colors`} {...on}>
                  {body}
                </Link>
              ) : (
                <span className={cls} {...on} tabIndex={r.tip ? 0 : undefined}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
