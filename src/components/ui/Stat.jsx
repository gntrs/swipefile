import React from 'react';
import { Link } from 'react-router-dom';
import Sparkline from '@/components/Sparkline';

// Colour on a value only when it means something: green good, red bad, amber
// a warning.
const VALUE_TONE = { good: 'text-emerald-300', bad: 'text-red-300', warn: 'text-amber-300' };
const TREND_TONE = { good: 'text-emerald-400', bad: 'text-red-400', warn: 'text-amber-400', neutral: 'text-ink-soft' };

const isZero = (v) => v === 0 || v === '0';

// One big number on a card: the label on top in Figtree, the number at the
// bottom in mono. A link when `to` is set. `badge` sits right of the label,
// `trend` (an array of numbers) draws a sparkline under the number.
export default function Stat({ label, value, to, sub, trend, tone, trendTone, badge, className = '' }) {
  const valueCls = isZero(value) ? 'text-ink-soft' : VALUE_TONE[tone] || 'text-ink';
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-small font-medium text-ink-soft min-w-0">{label}</p>
        {badge}
      </div>
      <p className={`num text-num-lg mt-auto pt-4 ${valueCls}`}>{value == null || value === '' ? '-' : value}</p>
      {sub && <p className="text-small text-ink-soft mt-1.5 truncate">{sub}</p>}
      {trend && trend.length > 1 && (
        <span className={`block mt-3 -mb-1 ${TREND_TONE[trendTone || tone] || TREND_TONE.neutral}`}>
          <Sparkline data={trend} className="w-full h-7" />
        </span>
      )}
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
