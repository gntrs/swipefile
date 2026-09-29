import React from 'react';
import { Warning } from '@phosphor-icons/react';

// Shown when fetchAll could only load part of a table (see lib/db.js): says
// how much is on screen, why the rest is missing, and offers a retry.
export default function PartialNotice({ rows, onRetry, noun = 'items', className = '' }) {
  if (!rows?.error) return null;
  return (
    <div role="alert" className={`flex items-center gap-3 bg-amber-50 rounded-xl pl-4 pr-1.5 py-1.5 ${className}`}>
      <Warning size={18} weight="bold" className="text-amber-600 flex-shrink-0" />
      <p className="flex-1 min-w-0 text-[15px] text-ink leading-snug">
        Showing {rows.length} {noun}. The rest failed to load: {rows.error.message || 'unknown error'}.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="press flex-shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[14px] font-semibold text-ink"
        >
          Retry
        </button>
      )}
    </div>
  );
}
