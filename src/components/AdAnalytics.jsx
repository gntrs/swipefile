import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { OWN_BRAND, isOwnBrand } from '@/lib/brand';
import { Panel, PanelLink, Metrics, EmptyState } from '@/components/ui';

// End-of-day numbers view. Two cards, both derived from the ads already loaded
// on the dashboard (no extra fetch): how OUR ads are performing, and how hard
// the competition is pushing. Single-series charts throughout, so the card
// title names the series and no legend is needed.

const isOurs = (a) => isOwnBrand(a.brand);
const num = (v) => (Number.isFinite(+v) ? +v : null);

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
  ['reach', 'Reach'],
];

export default function AdAnalytics({ ads }) {
  // ---- our ads ----
  const our = useMemo(() => {
    const rows = ads
      .filter(isOurs)
      .map((a) => ({
        id: a.id,
        name: a.metrics?.ad_name || a.hook || 'Untitled',
        spend: num(a.metrics?.spend),
        ctr: num(a.metrics?.ctr),
        cpc: num(a.metrics?.cpc),
        impressions: num(a.metrics?.impressions),
        verdict: a.verdict,
      }))
      .filter((r) => r.spend != null || r.ctr != null)
      .sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1));

    const totalSpend = rows.reduce((s, r) => s + (r.spend || 0), 0);
    // Blended CTR/CPC weighted by the right denominators (impressions, clicks),
    // never a plain average of rates.
    const totalImpr = rows.reduce((s, r) => s + (r.impressions || 0), 0);
    const totalClicks = rows.reduce(
      (s, r) => s + (r.ctr != null && r.impressions != null ? (r.ctr / 100) * r.impressions : 0),
      0
    );
    const blendedCtr = totalImpr ? (totalClicks / totalImpr) * 100 : null;
    const blendedCpc = totalClicks ? totalSpend / totalClicks : null;
    const best = rows.filter((r) => r.ctr != null).sort((a, b) => b.ctr - a.ctr)[0] || null;
    const maxCtr = Math.max(1, ...rows.map((r) => r.ctr || 0));
    return { rows, totalSpend, blendedCtr, blendedCpc, best, maxCtr };
  }, [ads]);

  // ---- competitor pressure: who is pushing hardest right now. Uses the
  // reliable status fields (live / days_running), not started_running, which
  // clusters when the Ad Library refreshes still-live ads. A brand with many
  // ads running AND many proven (30d+) is spending real money on what works. ----
  const pulse = useMemo(() => {
    const byBrand = new Map();
    let running = 0;
    let proven = 0;
    for (const a of ads) {
      if (isOurs(a)) continue;
      const brand = (a.brand || '?').trim();
      if (!byBrand.has(brand)) byBrand.set(brand, { brand, running: 0, proven: 0 });
      const r = byBrand.get(brand);
      const isRunning = a.metrics?.live || a.status === 'running';
      const isProven = a.verdict === 'winner' || (a.metrics?.days_running ?? 0) >= 30;
      if (isRunning) {
        r.running++;
        running++;
      }
      if (isProven) {
        r.proven++;
        proven++;
      }
    }
    const top = [...byBrand.values()].sort((a, b) => b.running - a.running).slice(0, 6);
    const max = Math.max(1, ...top.map((b) => b.running));
    return { top, max, running, proven };
  }, [ads]);

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
                { label: 'Spend', value: eur(our.totalSpend) },
                { label: 'CTR', value: pct(our.blendedCtr) },
                { label: 'CPC', value: eur(our.blendedCpc) },
                { label: 'Best CTR', value: our.best ? pct(our.best.ctr) : null, tone: our.best ? 'good' : undefined },
              ]}
            />
            {our.best && <p className="text-small text-ink-soft truncate mb-5">Best: {our.best.name}</p>}

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
                const values = { ctr: pct(r.ctr), cpc: eur(r.cpc), spend: eur(r.spend), reach: compact(r.impressions) };
                return (
                  <li key={r.id}>
                    <Link
                      to={`/ad/${r.id}`}
                      className={`${OUR_COLS} group gap-y-1 min-h-[44px] py-2.5 -mx-2 px-2 rounded-xl hover:bg-white/[0.03] transition-colors`}
                    >
                      <span className="col-span-4 sm:col-span-1 min-w-0">
                        <span className="block text-ui font-medium text-ink truncate">{r.name}</span>
                        {/* CTR against our best: the efficiency read at a glance. */}
                        <span aria-hidden="true" className="block h-1 mt-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-white/60"
                            style={{ width: `${Math.max(3, ((r.ctr || 0) / our.maxCtr) * 100)}%` }}
                          />
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
            { label: 'Proven (30d+)', value: compact(pulse.proven) },
          ]}
        />

        {/* Top rivals by ads running now. */}
        <p className="text-small font-medium text-ink-soft mb-1">Top rivals by ads running now</p>
        {pulse.top.length === 0 ? (
          <EmptyState text="No competitors tracked yet." />
        ) : (
          <ul className="divide-y divide-line">
            {pulse.top.map((b) => (
              <li key={b.brand}>
                <Link
                  to={`/ads?q=${encodeURIComponent(b.brand)}`}
                  className="group block min-h-[44px] py-2.5 -mx-2 px-2 rounded-xl hover:bg-white/[0.03] transition-colors"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-ui font-medium text-ink truncate">{b.brand}</span>
                    <span className="text-small text-ink-soft flex-shrink-0">
                      {b.running} running{b.proven > 0 && ` · ${b.proven} proven`}
                    </span>
                  </span>
                  <span aria-hidden="true" className="block h-1 mt-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-white/30"
                      style={{ width: `${Math.max(2, (b.running / pulse.max) * 100)}%` }}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
