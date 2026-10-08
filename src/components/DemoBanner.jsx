import React from 'react';
import { Link } from 'react-router-dom';
import { IS_DEMO } from '@/lib/db';

// One quiet line at the top of the content in demo mode, so nobody mistakes
// the sample library for their own. It sits in the page container, on the same
// left edge as the title under it, and scrolls away with the page. Layout
// hides it from lg, where the sidebar already says demo mode; the capture page
// shows it at every width and passes its own column as `className`.
export default function DemoBanner({ className = 'mx-auto w-full max-w-[var(--maxw)] px-[var(--gutter)]' }) {
  if (!IS_DEMO) return null;
  return (
    <div className={`pt-4 flex flex-wrap items-center gap-x-3 ${className}`}>
      <p className="min-w-0 text-small text-ink-soft py-2">Demo: nothing you change is saved.</p>
      <Link
        to="/setup"
        className="press -ml-2 inline-flex items-center min-h-[44px] px-2 rounded-xl text-small font-medium text-ink underline underline-offset-4 decoration-ink-soft hover:decoration-ink"
      >
        How to connect
      </Link>
    </div>
  );
}
