import React from 'react';

// One status badge for the whole app. Colour always rides with a word, never
// alone: green good, red bad, amber warning, grey for everything else.
// Figtree, sentence case: pass "Winner", not "WINNER".
const TONES = {
  good: 'bg-emerald-500/15 text-emerald-300',
  bad: 'bg-red-500/15 text-red-300',
  warn: 'bg-amber-500/15 text-amber-300',
  neutral: 'bg-white/[0.06] text-ink-soft',
};

export default function Badge({ tone = 'neutral', className = '', children, ...rest }) {
  return (
    <span
      className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-meta font-semibold whitespace-nowrap ${TONES[tone] || TONES.neutral} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
