import React from 'react';
import { splitShares } from '@/lib/charts';
import StatusDot from '@/components/ui/StatusDot';

// One bar split into parts of a whole (spend by verdict, ads by verdict). The
// parts keep the order they are given in: winner, testing, loser, not judged
// is the order the colours were checked in, so pass them that way. A part of
// zero is left out. The legend is always printed under the bar with the word,
// the amount and the share, so no part depends on its colour; screen readers
// get the same as a table.
//
// segments: [{ key, tone: 'good'|'warn'|'bad'|'neutral', label, value, display? }]
const FILL = { good: 'bg-status-good', warn: 'bg-status-warn', bad: 'bg-status-bad', neutral: 'bg-status-neutral' };

export default function SplitBar({ segments = [], caption, className = '' }) {
  const parts = (segments || []).filter((s) => s && Number.isFinite(Number(s.value)) && Number(s.value) > 0);
  if (!parts.length) return null;
  const shares = splitShares(parts.map((s) => Number(s.value)));
  const shown = (s) => s.display ?? String(s.value);
  return (
    <figure className={`min-w-0 ${className}`}>
      {caption && <figcaption className="text-small text-ink-soft mb-3">{caption}</figcaption>}
      <div aria-hidden="true" className="flex h-3 gap-[2px] rounded-[4px] overflow-hidden">
        {parts.map((s) => (
          <span
            key={s.key}
            data-key={s.key}
            className={`block h-full min-w-0 ${FILL[s.tone] || FILL.neutral}`}
            style={{ flex: `${Number(s.value)} 1 0px` }}
          />
        ))}
      </div>
      <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {parts.map((s, i) => (
          <li key={s.key} className="inline-flex items-center gap-1.5 min-w-0 text-small">
            <StatusDot tone={FILL[s.tone] ? s.tone : 'neutral'}>{s.label}</StatusDot>
            <span className="num text-ink">{shown(s)}</span>
            <span className="num text-ink-soft">{shares[i]}%</span>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">Part</th>
            <th scope="col">Amount</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((s, i) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>{shown(s)}</td>
              <td>{shares[i]}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
