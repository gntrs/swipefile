import React from 'react';

// One status badge for the whole app. Colour always rides with a word, never
// alone: good (winner), bad (loser, overdue), warn (testing, due soon), grey
// for everything else. The word sits in the status text tint on a faint wash
// of the status mark, both from the status tokens in tailwind.config.js.
// Figtree, sentence case: pass "Winner", not "WINNER".
const TONES = {
  good: 'bg-status-good/15 text-status-good-text',
  bad: 'bg-status-bad/15 text-status-bad-text',
  warn: 'bg-status-warn/15 text-status-warn-text',
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
