import React from 'react';
import Notice from '@/components/ui/Notice';
import { Button } from '@/components/ui/Button';

// Shown when fetchAll could only load part of a table (see lib/db.js): says
// how much is on screen, why the rest is missing, and offers a retry.
export default function PartialNotice({ rows, onRetry, noun = 'items', className = '' }) {
  if (!rows?.error) return null;
  return (
    <Notice
      tone="warn"
      className={className}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )
      }
    >
      Showing {rows.length} {noun}. The rest failed to load: {rows.error.message || 'unknown error'}.
    </Notice>
  );
}
