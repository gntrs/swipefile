import React from 'react';
import { Link } from 'react-router-dom';
import { IS_DEMO } from '@/lib/db';

// One quiet line at the top of the content in demo mode, so nobody mistakes
// the sample library for their own. Scrolls away with the page.
export default function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="bg-card border-b border-line px-5 sm:px-8 py-1 flex items-center gap-3">
      <p className="flex-1 min-w-0 text-[13px] text-ink-soft leading-snug py-2">
        Demo: nothing you change is saved, it resets on reload. Connect Supabase to keep your swipe file.
      </p>
      <Link
        to="/setup"
        className="press flex-shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 font-mono text-[12px] uppercase tracking-[0.12em] text-ink hover:text-accent-dim"
      >
        How
      </Link>
    </div>
  );
}
