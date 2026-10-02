import React from 'react';

// A state mark and its word: an 8px dot in the status colour, then the word in
// ink. The colour never stands alone. live is the white filled dot (running
// now), stopped the hollow ring (ran, not running). Green never means running.
const DOTS = {
  good: 'bg-status-good',
  warn: 'bg-status-warn',
  bad: 'bg-status-bad',
  neutral: 'bg-status-neutral',
  live: 'bg-status-live',
  stopped: 'border-[1.5px] border-ink-soft',
};

export const STATUS_DOT_TONES = Object.keys(DOTS);

export default function StatusDot({ tone = 'neutral', className = '', children, ...rest }) {
  const dot = DOTS[tone] || DOTS.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 text-small text-ink ${className}`} data-tone={DOTS[tone] ? tone : 'neutral'} {...rest}>
      <span aria-hidden="true" className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
      {children != null && children !== '' && <span className="min-w-0 truncate">{children}</span>}
    </span>
  );
}
