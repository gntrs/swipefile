import React from 'react';
import { Link } from 'react-router-dom';

const isZero = (v) => v === 0 || v === '0';

// One big number on a card: the label on top in Figtree, the number at the
// bottom in mono. A link when `to` is set. `badge` sits right of the label.
// The number is always ink: a count is not good or bad on its own, and a
// status that matters goes in the badge, with its word.
export default function Stat({ label, value, to, sub, badge, className = '' }) {
  const valueCls = isZero(value) ? 'text-ink-soft' : 'text-ink';
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-small font-medium text-ink-soft min-w-0">{label}</p>
        {badge}
      </div>
      <p className={`num text-num-lg mt-auto pt-4 ${valueCls}`}>{value == null || value === '' ? '-' : value}</p>
      {sub && <p className="text-small text-ink-soft mt-1.5 truncate">{sub}</p>}
    </>
  );
  const cls = `flex flex-col min-w-0 min-h-[7.5rem] bg-card rounded-xl3 p-5 lg:p-6 ${className}`;
  if (to) {
    return (
      <Link to={to} className={`${cls} press hover:bg-card-hi transition-colors`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
