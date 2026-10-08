import React from 'react';
import { Metrics, StatusDot } from '@/components/ui';
import { formatMoneyShort, formatPct } from '@/lib/format';

// Own winners and own losers side by side: what each side spent, what it
// returned and how its ads did. The status dot sits beside the column title
// only; every number stays ink.
const ratio = (v) => (v == null ? null : v.toFixed(2));

function Side({ tone, title, side, currency }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-x-2 mb-3">
        <StatusDot tone={tone} className="text-ui font-medium">
          {title}
        </StatusDot>
        <span className="text-small text-ink-soft">
          {side.ads} {side.ads === 1 ? 'ad' : 'ads'}
        </span>
      </p>
      {side.ads === 0 ? (
        <p className="text-small text-ink-soft">None of your ads is here yet.</p>
      ) : (
        <Metrics
          cols={3}
          items={[
            { label: 'Spent', value: side.spend == null ? null : formatMoneyShort(side.spend, currency) },
            { label: 'Returned', value: side.revenue == null ? null : formatMoneyShort(side.revenue, currency) },
            { label: 'ROAS', value: ratio(side.roas) },
            { label: 'CTR', value: side.ctr == null ? null : formatPct(side.ctr) },
            { label: 'CPC', value: side.cpc == null ? null : formatMoneyShort(side.cpc, currency) },
          ]}
        />
      )}
    </div>
  );
}

export default function WinnersVsLosers({ compare, currency = 'eur' }) {
  if (!compare) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
      <Side tone="good" title="Winners" side={compare.winners} currency={currency} />
      <Side tone="bad" title="Losers" side={compare.losers} currency={currency} />
    </div>
  );
}
