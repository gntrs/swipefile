import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { OWN_BRAND, isOwnBrand } from '@/lib/brand';
import { Panel, PanelLink, Metrics, EmptyState, Badge } from '@/components/ui';
import { ourPerformance } from '@/lib/performance';
import { barPct } from '@/lib/charts';

// How your own ads performed, as one card, from the ads already loaded (no
// extra fetch). The sums live in lib/performance.js. The rival side lives on
// the Competitors page. A single series bar, so a caption names the measure
// and no legend is needed.

const eur = (v) => (v == null ? '-' : `€${(+v).toFixed(2)}`);
const pct = (v) => (v == null ? '-' : `${(+v).toFixed(2)}%`);
const compact = (v) =>
  v == null ? '-' : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`;

// Our ads as a small table: the name, then four right aligned number columns
// that line up row to row. Under sm the numbers drop to a second line, each
// with its label.
const OUR_COLS =
  'grid grid-cols-4 gap-x-3 sm:grid-cols-[minmax(0,1fr)_4rem_4.5rem_5rem_3.5rem] sm:items-center';
const NUMS = [
  ['ctr', 'CTR'],
  ['cpc', 'CPC'],
  ['spend', 'Spend'],
  ['impressions', 'Impr.'],
];

// The verdict of each row as a badge: the colour rides with the word.
const VERDICT_BADGE = {
  winner: { tone: 'good', label: 'Winner' },
  testing: { tone: 'warn', label: 'Testing' },
  loser: { tone: 'bad', label: 'Loser' },
};
const verdictBadge = (v) => VERDICT_BADGE[v] || { tone: 'neutral', label: 'Not judged' };

export default function AdAnalytics({ ads, title = 'Your ads', className = '' }) {
  const our = useMemo(() => ourPerformance(ads, isOwnBrand), [ads]);

  return (
    <Panel
      title={title}
      className={className}
      action={<PanelLink to={`/ads?q=${encodeURIComponent(OWN_BRAND)}`}>All yours</PanelLink>}
    >
      {our.rows.length === 0 ? (
        <EmptyState text="No numbers on your ads yet. They fill in from the Meta import." />
      ) : (
        <>
          <Metrics
            cols={2}
            className="sm:grid-cols-4 mb-2"
            items={[
              { label: 'Total spend', value: eur(our.totalSpend) },
              { label: 'Blended CTR', value: pct(our.blendedCtr) },
              { label: 'Blended CPC', value: eur(our.blendedCpc) },
              { label: 'Best CTR', value: our.best ? pct(our.best.ctr) : null },
            ]}
          />
          <p className="text-small text-ink-soft mb-5">
            {our.best ? <span className="block truncate">Best CTR: {our.best.name}</span> : null}
            Blended CTR is clicks over impressions across {our.ctrAds} {our.ctrAds === 1 ? 'ad' : 'ads'}.
            {our.maxCtr > 0 && ` The bar under each ad is its CTR, 0 to ${pct(our.maxCtr)}.`}
          </p>

          <div aria-hidden="true" className={`${OUR_COLS} hidden sm:grid pb-2 border-b border-line text-meta font-medium text-ink-soft`}>
            <span>Ad</span>
            {NUMS.map(([k, label]) => (
              <span key={k} className="text-right">
                {label}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-line">
            {our.rows.map((r) => {
              const values = { ctr: pct(r.ctr), cpc: eur(r.cpc), spend: eur(r.spend), impressions: compact(r.impressions) };
              const w = barPct(r.ctr, our.maxCtr);
              const badge = verdictBadge(r.verdict);
              return (
                <li key={r.id}>
                  <Link
                    to={`/ad/${r.id}`}
                    className={`${OUR_COLS} press group gap-y-1 min-h-[56px] py-2.5 -mx-2 px-2 rounded-xl hover:bg-white/[0.03] transition-colors`}
                  >
                    <span className="col-span-4 sm:col-span-1 min-w-0">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-ui font-medium text-ink truncate min-w-0">{r.name}</span>
                        <Badge tone={badge.tone} className="flex-shrink-0">
                          {badge.label}
                        </Badge>
                      </span>
                      {/* CTR on a zero based scale up to your best CTR. No CTR, no bar. */}
                      <span aria-hidden="true" className="relative block h-1.5 mt-1.5 bg-viz-track">
                        {w > 0 && (
                          <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-viz-bar" style={{ width: `${w}%` }} />
                        )}
                      </span>
                    </span>
                    {NUMS.map(([k, label]) => (
                      <span key={k} className="flex flex-col sm:block sm:text-right">
                        <span className={`num text-small ${values[k] === '-' ? 'text-ink-soft' : 'text-ink'}`}>{values[k]}</span>
                        <span className="sm:sr-only text-meta text-ink-soft">{label}</span>
                      </span>
                    ))}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
