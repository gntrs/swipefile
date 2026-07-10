import React from 'react';

// One status-pill system for the whole app. Colour ALWAYS rides with a label,
// never alone. Tones map to the three vibrant semantic accents on a low-opacity
// dark chip, so they pop against the black without shouting.
const TONES = {
  good: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25',
  bad: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/25',
  warn: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25',
  neutral: 'bg-white/[0.06] text-ink-soft ring-1 ring-white/10',
};

export default function Pill({ tone = 'neutral', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${TONES[tone] || TONES.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
