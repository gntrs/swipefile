import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Warning, X } from '@phosphor-icons/react';
import { useSetup } from '@/lib/setup/SetupContext';

const KEY = 'sf:setup-banner';

function readDismissed() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

// Shown in Layout when the setup check found something worth fixing but not
// blocking (open sign ups, an old db-setup.sql, a public bucket).
export default function SetupBanner() {
  const { status, checks } = useSetup();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (status !== 'warn' || dismissed) return null;
  const first = checks.find((c) => c.level === 'warn');
  if (!first) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* private mode: dismissed for this page view only */
    }
  };

  return (
    <div className="bg-amber-50 px-5 sm:px-8 py-1 flex items-center gap-2">
      <Warning size={18} weight="bold" className="text-amber-600 flex-shrink-0" />
      <p className="flex-1 min-w-0 text-[14px] text-ink leading-snug py-2">
        Setup needs attention: {first.title}.
      </p>
      <Link
        to="/setup"
        className="press flex-shrink-0 inline-flex items-center justify-center min-h-[44px] px-3 rounded-xl text-[14px] font-semibold text-amber-700 underline-offset-4 hover:underline"
      >
        Open setup check
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="press flex-shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] -mr-3 rounded-xl text-ink-soft hover:text-ink"
      >
        <X size={18} weight="bold" />
      </button>
    </div>
  );
}
