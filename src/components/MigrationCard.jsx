import React from 'react';
import Notice from '@/components/ui/Notice';

// Shown in place of a widget whose table is not in the database yet.
export default function MigrationCard({ title, migration = 'db-setup.sql' }) {
  return (
    <Notice tone="warn">
      <p className="font-semibold">{title}</p>
      <p className="text-ink-soft mt-1">
        One quick setup step: paste <span className="font-semibold text-ink">{migration}</span> into your database
        provider's SQL editor, run it, then refresh this page.
      </p>
    </Notice>
  );
}
