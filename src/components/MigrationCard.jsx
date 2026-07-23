import React from 'react';
import { Wrench } from '@phosphor-icons/react';

// Shown in place of a widget whose table is not in the database yet.
export default function MigrationCard({ title, migration = 'db-setup.sql' }) {
  return (
    <div className="bg-card rounded-xl3 border border-line shadow-card p-5">
      <h2 className="font-semibold text-[15px] mb-2 flex items-center gap-2">
        <Wrench size={16} weight="bold" className="text-coral-dark" />
        {title}
      </h2>
      <p className="text-ink-soft text-[13px] leading-relaxed">
        One quick setup step: paste <span className="font-semibold text-ink">{migration}</span> into
        your database provider's SQL editor, run it, then refresh this page.
      </p>
    </div>
  );
}
