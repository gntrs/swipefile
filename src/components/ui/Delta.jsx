import React from 'react';
import { ArrowDown, ArrowUp, Minus } from '@phosphor-icons/react';

// A change between two periods, from deltaOf() in src/lib/periods.js: an
// arrow, the size of the change, and a sentence for screen readers that names
// both numbers and the period. The tone comes from the delta (its polarity),
// never from the caller: green and red only where one direction is better
// for you, grey otherwise. A null delta (no second period) renders nothing.
const TONE = { good: 'text-delta-good', bad: 'text-delta-bad', flat: 'text-delta-flat' };
const ICON = { up: ArrowUp, down: ArrowDown, flat: Minus };

const pctText = (pct) => `${Math.round(Math.abs(pct))}%`;

// "down 2 from 13, vs 30 days ago". Exported so a cell can reuse the words.
export function deltaSentence(delta, { format = (n) => String(n), period } = {}) {
  if (!delta) return '';
  const base = delta.direction === 'flat'
    ? `no change from ${format(delta.prev)}`
    : `${delta.direction} ${format(Math.abs(delta.diff))} from ${format(delta.prev)}`;
  const pct = delta.direction !== 'flat' && delta.pct != null ? ` (${pctText(delta.pct)})` : '';
  return `${base}${pct}${period ? `, ${period}` : ''}`;
}

export default function Delta({ delta, format = (n) => String(n), period, showPeriod = false, showPct = false, className = '' }) {
  if (!delta || !ICON[delta.direction]) return null;
  const Icon = ICON[delta.direction];
  const flat = delta.direction === 'flat';
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1 min-w-0 text-small ${className}`} data-tone={delta.tone}>
      <span aria-hidden="true" className={`inline-flex items-center gap-1 min-w-0 ${TONE[delta.tone] || TONE.flat}`}>
        <Icon size={12} weight="bold" className="flex-shrink-0" />
        <span className={flat ? '' : 'num'}>{flat ? 'No change' : format(Math.abs(delta.diff))}</span>
        {showPct && !flat && delta.pct != null && <span className="num">({pctText(delta.pct)})</span>}
      </span>
      {showPeriod && period && <span aria-hidden="true" className="text-ink-soft truncate">{period}</span>}
      <span className="sr-only">{deltaSentence(delta, { format, period })}</span>
    </span>
  );
}
