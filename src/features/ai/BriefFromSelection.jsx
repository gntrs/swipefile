import React from 'react';

// Turns selected ads or hooks into a brief. Until AI is part of the build it
// is a disabled button of the final size, so the bars around it keep their
// layout.
export default function BriefFromSelection({ adIds = [], hooks = [], label = 'Brief from these', onDone, className = '' }) {
  return (
    <button
      type="button"
      disabled
      title="AI is not part of this build yet."
      className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-4 rounded-2xl border border-line text-[14px] font-semibold text-ink-soft opacity-60 ${className}`}
    >
      {label}
    </button>
  );
}
