import React, { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import { db, fetchAll } from '@/lib/db';
import { Skeleton } from '@/components/Skeleton';
import { Page, PageHeader, Panel, Section, Button, Badge, Meta, EmptyState } from '@/components/ui';
import {
  geoStatus,
  countryOptions,
  euReach,
  fmtEuReach,
  FOCUS_COUNTRIES,
  compareMarkets,
  countryName,
} from '@/lib/ads';

// Markets read in this order: your focus countries (VITE_FOCUS_COUNTRIES)
// first, then the rest alphabetically. Labels come from countryName.

// A database read that treats a missing table/column as "feature not set up
// yet" rather than an error to crash on. Migrations 18 (geo columns) and 19
// (seo_ranks / trends_interest) may not be applied in every environment, so
// every section degrades to a setup hint instead of a white screen.
async function safeSelect(table, build) {
  try {
    let q = db.from(table).select('*');
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) return { rows: [], missing: true };
    return { rows: data || [], missing: false };
  } catch {
    return { rows: [], missing: true };
  }
}

const fmtDay = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

// Lower rank is better, so a rising line means we climbed. Guards on <2 points.
function RankSpark({ points, width = 56, height = 18 }) {
  if (!points || points.length < 2) return null;
  // position 1 = best. Missing (null) = off the bottom (worst seen + 1).
  const worst = Math.max(...points.map((p) => p ?? 0), 1);
  const vals = points.map((p) => (p == null ? worst + 1 : p));
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const step = width / (vals.length - 1);
  // Invert: best rank (min value) sits at the top of the box.
  const d = vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(((v - min) / span) * (height - 2) + 1).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible flex-shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The empty state for a block that is not set up yet: one quiet line, and the
// setup steps one level deeper behind "Set up", for the one person who needs
// them.
function NotSetUp({ summary, steps }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-body text-ink-soft min-w-0">{summary}</p>
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="-my-1 -mr-3"
        >
          Set up
          <CaretRight
            size={14}
            weight="bold"
            aria-hidden="true"
            className={`transition-transform ${open ? 'rotate-90' : ''}`}
          />
        </Button>
      </div>
      {open && (
        <ol id={id} className="mt-4 pt-4 border-t border-line space-y-3 text-body text-ink-soft">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="num text-ui text-ink-soft/60 flex-shrink-0 w-4">{i + 1}</span>
              <span className="min-w-0">{s}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const Cmd = ({ children }) => <code className="font-mono text-small text-ink break-all">{children}</code>;

export default function Intel() {
  const [ads, setAds] = useState([]);
  const [seo, setSeo] = useState({ rows: [], missing: false });
  const [trends, setTrends] = useState({ rows: [], missing: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [a, s, t] = await Promise.all([
        fetchAll((q) => q.order('created_at', { ascending: false }), 'ads'),
        safeSelect('seo_ranks', (q) => q.order('day', { ascending: false })),
        safeSelect('trends_interest', (q) => q.order('point_date', { ascending: false })),
      ]);
      if (!mounted) return;
      setAds(a);
      setSeo(s);
      setTrends(t);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ---- Geo (from the ads table, migration 18) ---- */
  const geo = useMemo(() => {
    const counts = { eu: 0, none: 0, unknown: 0 };
    ads.forEach((a) => {
      const s = geoStatus(a);
      counts[s] = (counts[s] || 0) + 1;
    });
    const ready = counts.eu > 0 || counts.none > 0;
    const countries = countryOptions(ads);
    const totalEuReach = ads.reduce((sum, a) => sum + (euReach(a) || 0), 0);
    // The single sharpest EU ad, to headline the reach we can actually see.
    const topEu = ads
      .filter((a) => euReach(a))
      .sort((x, y) => euReach(y) - euReach(x))[0] || null;
    return { counts, ready, countries, totalEuReach, topEu };
  }, [ads]);

  /* ---- SEO (seo_ranks, migration 19) ---- */
  const seoByMarket = useMemo(() => {
    const rows = seo.rows;
    if (!rows.length) return [];
    const markets = [...new Set(rows.map((r) => r.market))];
    return markets
      .map((market) => {
        const mine = rows.filter((r) => r.market === market);
        const latestDay = mine.reduce((mx, r) => (r.day > mx ? r.day : mx), mine[0].day);
        const today = mine.filter((r) => r.day === latestDay);
        const terms = [...new Set(today.map((r) => r.term))].map((term) => {
          const forTerm = today.filter((r) => r.term === term);
          const ours = forTerm.find((r) => r.is_ours) || null;
          const scanned = forTerm[0]?.scanned ?? null;
          const rivals = forTerm
            .filter((r) => !r.is_ours && r.position != null)
            .sort((a, b) => a.position - b.position)
            .slice(0, 3);
          // Our position over the tracked history, oldest -> newest.
          const history = mine
            .filter((r) => r.term === term && r.is_ours)
            .sort((a, b) => (a.day < b.day ? -1 : 1))
            .map((r) => r.position);
          return { term, ours, scanned, rivals, history };
        });
        // Terms we actually rank for float to the top, best first: the card
        // opens with the news rather than with a column of "not in top 20".
        terms.sort((a, b) => (a.ours?.position ?? 1e6) - (b.ours?.position ?? 1e6));
        const ranked = terms.filter((t) => t.ours?.position != null).length;
        return { market, latestDay, terms, ranked };
      })
      .sort((a, b) => compareMarkets(a.market, b.market));
  }, [seo.rows]);

  const seoLatestDay = useMemo(
    () => seoByMarket.reduce((mx, m) => (!mx || m.latestDay > mx ? m.latestDay : mx), null),
    [seoByMarket],
  );

  /* ---- Trends (trends_interest, migration 19) ---- */
  const trendsByGeo = useMemo(() => {
    const rows = trends.rows;
    if (!rows.length) return [];
    const geos = [...new Set(rows.map((r) => r.geo))];
    return geos
      .map((g) => {
        const mine = rows.filter((r) => r.geo === g);
        // Latest point per term.
        const byTerm = new Map();
        for (const r of mine) {
          const cur = byTerm.get(r.term);
          if (!cur || r.point_date > cur.point_date) byTerm.set(r.term, r);
        }
        const terms = [...byTerm.values()]
          .map((r) => ({ term: r.term, value: Number(r.value) || 0, hasData: r.has_data !== false }))
          .sort((a, b) => b.value - a.value);
        return { geo: g, terms };
      })
      .sort((a, b) => compareMarkets(a.geo, b.geo));
  }, [trends.rows]);

  const seoLive = !seo.missing && seoByMarket.length > 0;
  const trendsLive = !trends.missing && trendsByGeo.length > 0;

  if (loading)
    return (
      <Page id="intel">
        <Skeleton className="w-52 h-8 mb-3" />
        <Skeleton className="w-80 max-w-full h-4 mb-8" />
        <div className="grid gap-4 lg:gap-6">
          <Skeleton className="w-full h-40 rounded-xl3" />
          <Skeleton className="w-full h-40 rounded-xl3" />
        </div>
      </Page>
    );

  return (
    <Page id="intel">
      <PageHeader
        title="Where we stand"
        context="Search rank, EU ad geography and demand trends for the markets we chase."
      />

      {/* ============ SEO ============ */}
      <Section first title="Search rank" meta={seoLive ? `Updated ${fmtDay(seoLatestDay)}` : 'Not set up'}>
        {!seoLive ? (
          <NotSetUp
            summary="No search rank data yet."
            steps={[
              ...(seo.missing
                ? [<>Apply <Cmd>db-setup.sql</Cmd> in your database provider's SQL editor.</>]
                : []),
              <>Run <Cmd>node scripts/seo-rank-pull.mjs</Cmd> to chart where you sit against competitors in your markets.</>,
            ]}
          />
        ) : (
          <div className="grid gap-4 lg:gap-6 md:grid-cols-3">
            {seoByMarket.map(({ market, terms, ranked }) => (
              <Panel
                key={market}
                title={countryName(market)}
                action={
                  <span className="text-small text-ink-soft">
                    {ranked} of {terms.length} ranking
                  </span>
                }
              >
                <ul className="divide-y divide-line">
                  {terms.map(({ term, ours, scanned, rivals, history }) => {
                    const placed = ours && ours.position != null;
                    return (
                      <li key={term} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className={`text-ui min-w-0 ${placed ? 'text-ink font-medium' : 'text-ink-soft'}`}>{term}</p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-ink-soft">
                              <RankSpark points={history} />
                            </span>
                            {placed ? (
                              <span className="num text-ui text-emerald-300">#{ours.position}</span>
                            ) : (
                              <span className="num text-small text-ink-soft/70">&gt;{scanned || 20}</span>
                            )}
                          </div>
                        </div>
                        {rivals.length > 0 && (
                          <Meta
                            as="p"
                            className="text-small text-ink-soft mt-1"
                            items={rivals.map((r) => (
                              <span key={r.domain}>
                                #{r.position} {r.domain.replace(/^www\./, '')}
                              </span>
                            ))}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      {/* ============ GEO / EU reach ============ */}
      <Section title="EU ad geography" meta={geo.ready ? `${geo.counts.eu} EU ads` : 'Not set up'}>
        {!geo.ready ? (
          <NotSetUp
            summary="No ads carry EU transparency data yet."
            steps={[
              <>Add <Cmd>META_ACCESS_TOKEN</Cmd> to <Cmd>.env</Cmd>.</>,
              <>Apply <Cmd>db-setup.sql</Cmd>.</>,
              <>Run <Cmd>node scripts/sync-geo.mjs</Cmd> to pull reach and per-country splits (your VITE_FOCUS_COUNTRIES first).</>,
            ]}
          />
        ) : (
          <div className="grid gap-4 lg:gap-6 md:grid-cols-3">
            <Panel title="Transparency flags">
              <ul className="divide-y divide-line">
                <FlagRow label="Ran in EU" value={geo.counts.eu} tone="emerald" />
                <FlagRow label="Confirmed not EU" value={geo.counts.none} tone="line" />
                <FlagRow label="Unchecked" value={geo.counts.unknown} tone="soft" />
              </ul>
            </Panel>

            <Panel title="Ads by country">
              {geo.countries.length === 0 ? (
                <EmptyState text="No per-country data resolved yet." />
              ) : (
                <ul className="divide-y divide-line -my-1">
                  {geo.countries.slice(0, 6).map(({ code, label, count }) => (
                    <li key={code}>
                      <Link
                        to={`/ads?country=${code}`}
                        className="group flex items-center justify-between gap-3 min-h-[44px] -mx-2 px-2 rounded-xl hover:bg-white/[0.03] transition-colors"
                      >
                        <span className="flex items-center gap-2 min-w-0 text-ui text-ink">
                          <span className="truncate">{label}</span>
                          {FOCUS_COUNTRIES.includes(code) && <Badge>Focus</Badge>}
                        </span>
                        <span className="num text-num text-ink">{count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="EU reach seen">
              <p className="num text-num-lg text-ink">
                {geo.totalEuReach >= 1000 ? `${(geo.totalEuReach / 1000).toFixed(1)}k` : geo.totalEuReach}
              </p>
              <p className="text-small text-ink-soft mt-2">people reached across flagged ads</p>
              {geo.topEu && (
                <p className="text-small text-ink-soft mt-4 pt-4 border-t border-line">
                  Biggest: <span className="font-medium text-ink">{geo.topEu.brand || 'an ad'}</span> at{' '}
                  <span className="font-semibold text-ink">{fmtEuReach(geo.topEu)}</span>
                </p>
              )}
            </Panel>
          </div>
        )}
      </Section>

      {/* ============ TRENDS ============ */}
      <Section title="Demand trends" meta={trendsLive ? 'Live' : 'Not set up'}>
        {!trendsLive ? (
          <NotSetUp
            summary="No Google Trends data yet."
            steps={[
              ...(trends.missing
                ? [<>Apply <Cmd>db-setup.sql</Cmd> in your database provider's SQL editor.</>]
                : []),
              <>Run <Cmd>node scripts/trends-pull.mjs</Cmd> for search interest on parent-intent terms. Google rate-limits this hard, so a run that returns nothing usually just needs retrying later.</>,
              <>Values only compare within one geo, never across geos.</>,
            ]}
          />
        ) : (
          <div className="grid gap-4 lg:gap-6 md:grid-cols-3">
            {trendsByGeo.map(({ geo: g, terms }) => (
              <Panel key={g} title={countryName(g)}>
                <ul className="space-y-3">
                  {terms.slice(0, 6).map(({ term, value, hasData }) => (
                    <li key={term}>
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span className="text-small text-ink-soft truncate">{term}</span>
                        <span className="num text-small text-ink">{hasData ? value : '-'}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-canvas overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${Math.max(value, hasData ? 2 : 0)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-small text-ink-soft mt-4">Relative interest, 0 to 100 within {countryName(g)}</p>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      <p className="text-small text-ink-soft mt-10 lg:mt-12">
        Refreshed daily by <Cmd>scripts/seo-cron.sh</Cmd>.
      </p>
    </Page>
  );
}

function FlagRow({ label, value, tone }) {
  const dot = tone === 'emerald' ? 'bg-emerald-400' : tone === 'line' ? 'bg-red-300' : 'bg-white/20';
  return (
    <li className="flex items-center justify-between gap-3 min-h-[44px]">
      <span className="flex items-center gap-2.5 text-ui text-ink">
        <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${dot}`} />
        {label}
      </span>
      <span className={`num text-num ${value ? 'text-ink' : 'text-ink-soft'}`}>{value}</span>
    </li>
  );
}
