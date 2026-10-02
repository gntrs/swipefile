import React from 'react';
import { Link } from 'react-router-dom';

// The quiet line in place of own ad numbers: either no brand is marked as
// yours yet, or it is and the Meta import has not brought numbers in.
// `again` is for the later sections of a page that already showed the full
// line with its Setup link once, so the same sentence is not read five times.
export default function OwnBrandHint({ brandSet, again = false, className = '' }) {
  if (brandSet) {
    return <p className={`text-body text-ink-soft ${className}`}>No numbers on your ads yet. They fill in from the Meta import.</p>;
  }
  if (again) return <p className={`text-body text-ink-soft ${className}`}>Your own numbers show here once your brand is set.</p>;
  return (
    <p className={`text-body text-ink-soft ${className}`}>
      Tell Swipefile which brand is yours to see your own numbers here.{' '}
      <Link
        to="/setup"
        className="press inline-flex items-center min-h-[44px] min-w-[44px] -my-3 px-1 text-ink underline underline-offset-4 decoration-ink-soft hover:decoration-ink"
      >
        Setup
      </Link>
    </p>
  );
}
