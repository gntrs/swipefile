import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MagnifyingGlass,
  GlobeHemisphereWest,
  TrendUp,
  CaretRight,
} from '@phosphor-icons/react';
import { db, fetchAll } from '@/lib/db';
import { Skeleton } from '@/components/Skeleton';
import {
  geoStatus,
  countryOptions,
  euReach,
  fmtEuReach,
  FOCUS_COUNTRIES,
} from '@/lib/ads';

// The markets we actually care about, in the order we want to read them.
const MARKET_ORDER = ['ES', 'US', 'GB', 'FR'];
const MARKET_LABEL = { ES: 'Spain', US: 'United States', GB: 'United Kingdom', FR: 'France' };
const marketRank = (m) => {
  const i = MARKET_ORDER.indexOf(m);
  return i === -1 ? 99 : i;
};

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

// One section header: icon, title, and a right-aligned status that says in a
// glance whether this block is live and how fresh it is. Keeping the header
// identical across the three sections is what makes the page scan as a page
// rather than as three unrelated widgets.
function SectionHead({ icon: Icon, title, status, live }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <Icon size={17} weight="bold" className={live ? 'text-ink' : 'text-ink-soft'} />
      <h2 className="font-semibold text-[15px] tracking-tight">{title}</h2>
      <span className="flex-1 h-px bg-line" />
      <span className={`text-[11px] tabular-nums ${live ? 'text-ink-soft' : 'text-ink-soft/60'}`}>{status}</span>
    </div>
  );
}

// The empty state. The old version shouted three shell commands at whoever
// opened the page; two of the three sections being unconfigured turned the
// screen into a to-do list. Now the section states its condition in one quiet
// line and folds the setup steps one level deeper, for the one person who
// needs them.
function NotSetUp({ summary, steps }) {
  return (
    <details className="group rounded-xl3 border border-line bg-card/60 overflow-hidden">
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer list-none select-none text-[13px] text-ink-soft transition-colors duration-150 ease-swift hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="flex-1 min-w-0">{summary}</span>
        <span className="flex items-center gap-1 text-[12px] flex-shrink-0">
          Set up
          <CaretRight
            size={12}
            weight="bold"
            className="transition-transform duration-200 ease-swift group-open:rotate-90"
          />
        </span>
      </summary>
      <ol className="px-4 pb-4 pt-1 space-y-1.5 text-[12px] text-ink-soft border-t border-line/60 mt-0">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 pt-1.5">
            <span className="tabular-nums text-ink-soft/60 flex-shrink-0">{i + 1}</span>
            <span className="min-w-0">{s}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

const Cmd = ({ children }) => (
  <code className="text-[11.5px] font-mono text-ink break-all">{children}</code>
);

const Card = ({ children }) => (
  <div className="bg-card rounded-xl3 border border-line shadow-card p-5">{children}</div>
);

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
      .sort((a, b) => marketRank(a.market) - marketRank(b.market));
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
      .sort((a, b) => marketRank(a.geo) - marketRank(b.geo));
  }, [trends.rows]);

  const seoLive = !seo.missing && seoByMarket.length > 0;
  const trendsLive = !trends.missing && trendsByGeo.length > 0;

  if (loading)
    return (
      <div className="px-5 sm:px-8 py-6 max-w-[1100px] mx-auto">
        <Skeleton className="w-40 h-3.5 mb-2" />
        <Skeleton className="w-52 h-8 mb-6" />
        <div className="grid gap-4">
          <Skeleton className="w-full h-40 rounded-xl3" />
          <Skeleton className="w-full h-40 rounded-xl3" />
        </div>
      </div>
    );

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[1100px] mx-auto">
      <header className="mb-7 animate-rise">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Market intel</p>
        <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight mt-1">Where we stand</h1>
        <p className="text-ink-soft text-[14px] mt-1">Search rank, EU ad geography and demand trends for the markets we chase.</p>
      </header>

      {/* ============ SEO ============ */}
      <section className="mb-7 animate-rise" style={{ animationDelay: '40ms' }}>
        <SectionHead
          icon={MagnifyingGlass}
          title="Search rank"
          live={seoLive}
          status={seoLive ? fmtDay(seoLatestDay) : 'Not set up'}
        />

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
          <div className="grid gap-4 md:grid-cols-3">
            {seoByMarket.map(({ market, terms, ranked }) => (
              <Card key={market}>
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="font-semibold text-[15px] tracking-tight">{MARKET_LABEL[market] || market}</h3>
                  <span className="text-[11px] text-ink-soft tabular-nums">
                    {ranked}/{terms.length} ranking
                  </span>
                </div>
                <div className="space-y-3">
                  {terms.map(({ term, ours, scanned, rivals, history }) => {
                    const placed = ours && ours.position != null;
                    return (
                      <div key={term}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className={`text-[13px] leading-snug min-w-0 ${placed ? 'text-ink font-medium' : 'text-ink-soft'}`}>
                            {term}
                          </p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-coral-dark/60">
                              <RankSpark points={history} />
                            </span>
                            {placed ? (
                              <span className="text-[12px] font-semibold tabular-nums text-emerald-500 bg-emerald-50 rounded px-1.5 py-0.5">
                                #{ours.position}
                              </span>
                            ) : (
                              <span className="text-[11px] tabular-nums text-ink-soft/60">
                                &gt;{scanned || 20}
                              </span>
                            )}
                          </div>
                        </div>
                        {rivals.length > 0 && (
                          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1">
                            {rivals.map((r) => (
                              <span key={r.domain} className="text-[11px] text-ink-soft/70 tabular-nums">
                                <span className="text-ink-soft">#{r.position}</span> {r.domain.replace(/^www\./, '')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ============ GEO / EU reach ============ */}
      <section className="mb-7 animate-rise" style={{ animationDelay: '80ms' }}>
        <SectionHead
          icon={GlobeHemisphereWest}
          title="EU ad geography"
          live={geo.ready}
          status={geo.ready ? `${geo.counts.eu} EU ads` : 'Not set up'}
        />

        {!geo.ready ? (
          <NotSetUp
            summary="No ads carry EU transparency data yet."
            steps={[
              <>Add <Cmd>META_ACCESS_TOKEN</Cmd> to <Cmd>.env</Cmd>.</>,
              <>Apply <Cmd>db-setup.sql</Cmd>.</>,
              <>Run <Cmd>node scripts/sync-geo.mjs</Cmd> to pull reach and per-country splits (Spain and France first).</>,
            ]}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {/* Flag distribution */}
            <Card>
              <h3 className="font-semibold text-[15px] tracking-tight mb-4">Transparency flags</h3>
              <div className="space-y-2.5">
                <FlagRow label="Ran in EU" value={geo.counts.eu} tone="emerald" />
                <FlagRow label="Confirmed not EU" value={geo.counts.none} tone="line" />
                <FlagRow label="Unchecked" value={geo.counts.unknown} tone="soft" />
              </div>
            </Card>

            {/* Country leaderboard */}
            <Card>
              <h3 className="font-semibold text-[15px] tracking-tight mb-4">Ads by country</h3>
              {geo.countries.length === 0 ? (
                <p className="text-ink-soft text-[13px]">No per-country data resolved yet.</p>
              ) : (
                <div className="space-y-2">
                  {geo.countries.slice(0, 6).map(({ code, label, count }) => (
                    <Link
                      key={code}
                      to={`/ads?country=${code}`}
                      className="flex items-center justify-between group -mx-1 px-1 rounded transition-colors duration-150 ease-swift hover:bg-cream/60 active:bg-cream"
                    >
                      <span className="text-[13px] transition-colors duration-150 group-hover:text-coral-dark">
                        {label}
                        {FOCUS_COUNTRIES.includes(code) && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase text-coral-dark">focus</span>
                        )}
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums">{count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            {/* Reach */}
            <Card>
              <h3 className="font-semibold text-[15px] tracking-tight mb-4">EU reach seen</h3>
              <p className="text-[28px] font-semibold tabular-nums leading-none tracking-tight">
                {geo.totalEuReach >= 1000 ? `${(geo.totalEuReach / 1000).toFixed(1)}k` : geo.totalEuReach}
              </p>
              <p className="text-[12px] text-ink-soft mt-1.5">people reached across flagged ads</p>
              {geo.topEu && (
                <p className="text-[12px] text-ink-soft mt-3 pt-3 border-t border-line">
                  Biggest: <span className="font-medium text-ink">{geo.topEu.brand || 'an ad'}</span> at{' '}
                  <span className="font-semibold text-ink">{fmtEuReach(geo.topEu)}</span>
                </p>
              )}
            </Card>
          </div>
        )}
      </section>

      {/* ============ TRENDS ============ */}
      <section className="mb-7 animate-rise" style={{ animationDelay: '120ms' }}>
        <SectionHead
          icon={TrendUp}
          title="Demand trends"
          live={trendsLive}
          status={trendsLive ? 'live' : 'Not set up'}
        />

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
          <div className="grid gap-4 md:grid-cols-3">
            {trendsByGeo.map(({ geo: g, terms }) => (
              <Card key={g}>
                <h3 className="font-semibold text-[15px] tracking-tight mb-4">{MARKET_LABEL[g] || g}</h3>
                <div className="space-y-2.5">
                  {terms.slice(0, 6).map(({ term, value, hasData }) => (
                    <div key={term}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] text-ink-soft truncate pr-2">{term}</span>
                        <span className="text-[12px] font-semibold tabular-nums">{hasData ? value : '—'}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-cream overflow-hidden">
                        <div className="h-full bg-coral rounded-full" style={{ width: `${Math.max(value, hasData ? 2 : 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-ink-soft/60 mt-3.5">relative interest, 0–100 within {MARKET_LABEL[g] || g}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="text-[11.5px] text-ink-soft/60">
        Refreshed daily by <Cmd>scripts/seo-cron.sh</Cmd>.
      </p>
    </div>
  );
}

function FlagRow({ label, value, tone }) {
  const dot =
    tone === 'emerald' ? 'bg-emerald-400' : tone === 'line' ? 'bg-red-300' : 'bg-line';
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-[13px] text-ink-soft">
        <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="text-[13px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}
