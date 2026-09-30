import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { OWN_BRAND, isOwnBrand } from '@/lib/brand';
import { Panel, PanelLink, Metrics, EmptyState } from '@/components/ui';
import { ourPerformance, rivalPressure } from '@/lib/performance';
import { barPct } from '@/lib/charts';
import BarList from '@/components/charts/BarList';

// End-of-day numbers view. Two cards, both derived from the ads already loaded
// on the dashboard (no extra fetch): how OUR ads are performing, and how hard
// the competition is pushing. The sums live in lib/performance.js. Single
// series bars throughout, so a caption names the measure and no legend is
// needed.

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

export default function AdAnalytics({ ads }) {
  const our = useMemo(() => ourPerformance(ads, isOwnBrand), [ads]);
  const pulse = useMemo(() => rivalPressure(ads, isOwnBrand), [ads]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6 min-w-0">
      {/* Our ads */}
      <Panel
        title="Our ad performance"
        className="xl:col-span-7"
        action={<PanelLink to={`/ads?q=${encodeURIComponent(OWN_BRAND)}`}>All ours</PanelLink>}
      >
        {our.rows.length === 0 ? (
          <EmptyState text="No numbers on our ads yet. They fill in from the Meta import." />
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
                return (
                  <li key={r.id}>
                    <Link
                      to={`/ad/${r.id}`}
                      className={`${OUR_COLS} group gap-y-1 min-h-[44px] py-2.5 -mx-2 px-2 rounded-xl hover:bg-white/[0.03] transition-colors`}
                    >
                      <span className="col-span-4 sm:col-span-1 min-w-0">
                        <span className="block text-ui font-medium text-ink truncate">{r.name}</span>
                        {/* CTR on a zero based scale up to our best CTR. No CTR, no bar. */}
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

      {/* Competitor pressure */}
      <Panel title="Competitor pressure" className="xl:col-span-5" action={<PanelLink to="/competitors">Competitors</PanelLink>}>
        <Metrics
          cols={2}
          className="mb-6"
          items={[
            { label: 'Their ads running now', value: compact(pulse.running) },
            { label: 'Ran 30 days or more', value: compact(pulse.proven) },
          ]}
        />

        {pulse.top.length === 0 ? (
          <EmptyState text="No rival ads running right now." />
        ) : (
          <>
            <BarList
              caption="Ads running now, per rival"
              rows={pulse.top.map((b) => ({
                key: b.brand,
                label: b.brand,
                value: b.running,
                to: `/ads?q=${encodeURIComponent(b.brand)}`,
                aside: b.proven > 0 ? `${b.proven} ran 30d+` : null,
                tip: `running now${b.proven > 0 ? `, ${b.proven} of their saved ads ran 30 days or more` : ''}`,
              }))}
            />
            {pulse.more > 0 && (
              <p className="text-small text-ink-soft mt-2">
                {pulse.more} more {pulse.more === 1 ? 'rival' : 'rivals'} running fewer ads
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
