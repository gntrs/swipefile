import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CurrencyEur, CursorClick, Target, TrendUp } from '@phosphor-icons/react';
import { OWN_BRAND, isOwnBrand } from '@/lib/brand';

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

const ACCENT = {
  coral: 'text-coral-dark',
  emerald: 'text-emerald-600',
  blue: 'text-blue-600',
  violet: 'text-violet-600',
  amber: 'text-amber-600',
};

function Stat({ icon: Icon, label, value, sub, accent = 'coral' }) {
  return (
    <div className="bg-card rounded-2xl border border-line px-3.5 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={15} weight="bold" className={ACCENT[accent] || ACCENT.coral} />
        <span className="text-[12px] font-medium text-ink-soft">{label}</span>
      </div>
      <p className="font-mono text-[19px] font-semibold tabular-nums leading-none tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-ink-soft mt-1 truncate">{sub}</p>}
    </div>
  );
}

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
    <div className="grid lg:grid-cols-2 gap-4 mb-4">
      {/* Our ads */}
      <div className="bg-card rounded-xl3 border border-line shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[15px]">Our ad performance</h2>
          <Link to={`/ads?q=${encodeURIComponent(OWN_BRAND)}`} className="text-[12px] text-coral-dark font-semibold">
            All ours
          </Link>
        </div>

        {our.rows.length === 0 ? (
          <p className="text-ink-soft text-[13px]">
            No numbers on our ads yet. They fill in from the Meta import.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <Stat icon={CurrencyEur} label="Spend" value={eur(our.totalSpend)} accent="coral" />
              <Stat icon={CursorClick} label="CTR" value={pct(our.blendedCtr)} accent="blue" />
              <Stat icon={Target} label="CPC" value={eur(our.blendedCpc)} accent="violet" />
              <Stat
                icon={TrendUp}
                label="Best CTR"
                value={our.best ? pct(our.best.ctr) : '-'}
                sub={our.best?.name}
                accent="emerald"
              />
            </div>

            {/* CTR per ad - bar width = CTR relative to our best, the efficiency
                read; money + cost sit in the label line. */}
            <div className="flex flex-col gap-2.5">
              {our.rows.map((r) => (
                <Link key={r.id} to={`/ad/${r.id}`} className="block group">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[13px] font-medium truncate group-hover:text-coral-dark transition-colors">
                      {r.name}
                    </span>
                    <span className="font-mono text-[12px] text-ink-soft tabular-nums flex-shrink-0">
                      {pct(r.ctr)} · {eur(r.cpc)} CPC
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 rounded-full bg-card overflow-hidden">
                      <div
                        className="h-full rounded-full bg-coral"
                        style={{ width: `${Math.max(3, ((r.ctr || 0) / our.maxCtr) * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-ink-soft tabular-nums w-20 text-right flex-shrink-0">
                      {eur(r.spend)} · {compact(r.impressions)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Competitor pressure */}
      <div className="bg-card rounded-xl3 border border-line shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[15px]">Competitor pressure</h2>
          <Link to="/competitors" className="text-[12px] text-coral-dark font-semibold">
            Competitors
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <Stat icon={CursorClick} label="Their ads running now" value={compact(pulse.running)} accent="amber" />
          <Stat icon={TrendUp} label="Proven (30d+)" value={compact(pulse.proven)} accent="emerald" />
        </div>

        {/* Top rivals by ads running now; the mint slice marks how many are
            proven long-runners (staying power, not just testing). */}
        <p className="text-[12px] text-ink-soft mb-2">Top rivals by ads running now</p>
        {pulse.top.length === 0 ? (
          <p className="text-ink-soft text-[13px]">No competitors tracked yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {pulse.top.map((b) => (
              <Link key={b.brand} to={`/ads?q=${encodeURIComponent(b.brand)}`} className="block group">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-[13px] font-medium truncate group-hover:text-coral-dark transition-colors">
                    {b.brand}
                  </span>
                  <span className="font-mono text-[12px] text-ink-soft tabular-nums flex-shrink-0">
                    {b.running} running{b.proven > 0 && ` · ${b.proven} proven`}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-card overflow-hidden flex">
                  <div
                    className="h-full rounded-full bg-white/25"
                    style={{ width: `${Math.max(2, (b.running / pulse.max) * 100)}%` }}
                    title={`${b.running} running`}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
