import React from 'react';
import { formatMoneyShort, formatPct } from '@/lib/format';

// Your ads grouped by angle or format, one row per group: how many ads, what
// they spent, and the blended CTR and ROAS. Not interactive. Under sm the
// numbers drop to a second line, each with its label.
const COLS = 'grid grid-cols-4 gap-x-3 sm:grid-cols-[minmax(0,1fr)_3rem_4.5rem_4rem_3.5rem] sm:items-center';
const HEAD = [
  ['ads', 'Ads'],
  ['spend', 'Spend'],
  ['ctr', 'CTR'],
  ['roas', 'ROAS'],
];

export default function OwnGroupTable({ rows = [], currency = 'eur', label }) {
  if (!rows.length) return null;
  return (
    <div role="table" aria-label={label} className="min-w-0">
      <div role="row" className={`${COLS} hidden sm:grid min-h-[44px] border-b border-line text-small font-medium text-ink-soft`}>
        <span role="columnheader">{label}</span>
        {HEAD.map(([k, l]) => (
          <span role="columnheader" key={k} className="text-right">
            {l}
          </span>
        ))}
      </div>
      <div role="rowgroup" className="divide-y divide-line">
        {rows.map((r) => {
          const values = {
            ads: String(r.ads),
            spend: r.spend == null ? '-' : formatMoneyShort(r.spend, currency),
            ctr: r.ctr == null ? '-' : formatPct(r.ctr),
            roas: r.roas == null ? '-' : r.roas.toFixed(2),
          };
          return (
            <div role="row" key={r.id ?? 'none'} className={`${COLS} gap-y-1 py-2.5 sm:min-h-[56px]`}>
              <span role="rowheader" className="col-span-4 sm:col-span-1 min-w-0 text-ui text-ink truncate">
                {r.label}
              </span>
              {HEAD.map(([k, l]) => (
                <span role="cell" key={k} className="flex flex-col sm:block sm:text-right">
                  <span className={`num text-ui ${values[k] === '-' ? 'text-ink-soft' : 'text-ink'}`}>{values[k]}</span>
                  <span className="sm:sr-only text-meta text-ink-soft">{l}</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
