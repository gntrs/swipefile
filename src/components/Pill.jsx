import React from 'react';

// One status pill for the whole app. Colour always rides with a label, never
// alone: green good, red bad, amber warning, grey for everything else, each a
// low tint behind mono text. No outline.
const TONES = {
  good: 'bg-emerald-500/15 text-emerald-300',
  bad: 'bg-red-500/15 text-red-300',
  warn: 'bg-amber-500/15 text-amber-300',
  neutral: 'bg-white/[0.06] text-ink-soft',
};

export default function Pill({ tone = 'neutral', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.08em] whitespace-nowrap ${TONES[tone] || TONES.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
