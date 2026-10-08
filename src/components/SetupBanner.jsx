import React, { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { useSetup } from '@/lib/setup/SetupContext';
import { Button, IconButton, Notice } from '@/components/ui';

const KEY = 'sf:setup-banner';

function readDismissed() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

// Shown in Layout when the setup check found something worth fixing but not
// blocking (open sign ups, an old db-setup.sql, a public bucket). It sits in
// the page container so its left edge is the title's left edge.
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
    <div className="mx-auto w-full max-w-[var(--maxw)] px-[var(--gutter)] pt-4">
      <Notice
        tone="warn"
        action={
          <>
            <Button to="/setup">Open setup check</Button>
            <IconButton label="Dismiss" icon={X} onClick={dismiss} />
          </>
        }
      >
        Setup needs attention: {first.title}.
      </Notice>
    </div>
  );
}
