import React from 'react';

const COLS = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' };
// A tone marks the number with a status dot beside its label; the number
// itself stays ink, so colour never stands in for the word.
const DOT = { good: 'bg-status-good', bad: 'bg-status-bad', warn: 'bg-status-warn' };

const missing = (v) => v === null || v === undefined || v === '';

// A row of numbers with their labels under them. The value is mono, the label
// is Figtree in sentence case. A missing value prints a muted hyphen. Extra
// responsive columns go in className (cols={3} className="lg:grid-cols-5").
export default function Metrics({ items = [], cols = 3, className = '' }) {
  return (
    <dl className={`grid ${COLS[cols] || COLS[3]} gap-x-4 gap-y-4 ${className}`}>
      {items.map((item, i) => (
        <div key={item.key ?? `${item.label}-${i}`} className="min-w-0 flex flex-col-reverse">
          <dt className="flex items-center gap-1.5 text-meta font-medium text-ink-soft mt-0.5 min-w-0">
            {DOT[item.tone] && !missing(item.value) && (
              <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[item.tone]}`} />
            )}
            <span className="truncate">{item.label}</span>
          </dt>
          <dd className={`num text-lead truncate ${missing(item.value) ? 'text-ink-soft' : 'text-ink'}`}>
            {missing(item.value) ? '-' : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
