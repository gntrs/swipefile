import React from 'react';
import { LIBRARY_HELP } from '@/lib/library/keys';
import { Sheet, Kbd } from '@/components/ui';

// The list of keyboard shortcuts, in a small sheet. Escape or the close button
// shuts it. It is a plain labelled section with data-sheet="keys", never a
// dialog, so the shortcuts it lists keep working under it.
export default function KeyHelp({ open, onClose, keys = LIBRARY_HELP, title = 'Keyboard shortcuts' }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} sheetId="keys" dialog={false}>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 text-body">
        {keys.map(([k, label]) => (
          <React.Fragment key={k}>
            <dt className="flex gap-1">
              {k.split(' ').map((part) => (
                <Kbd key={part}>{part}</Kbd>
              ))}
            </dt>
            <dd className="text-ink-soft">{label}</dd>
          </React.Fragment>
        ))}
      </dl>
    </Sheet>
  );
}
