import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isOwnBrand } from '@/lib/brand';
import {
  PlusCircle,
  MagnifyingGlass,
  Star,
  Trophy,
  Scales,
  ClockCounterClockwise,
  X,
} from '@phosphor-icons/react';
import { fetchAll } from '@/lib/db';
import {
  isProven,
  isStarred,
  isRecent,
  adCountries,
  countryOptions,
  geoStatus,
  GEO_STATUS,
} from '@/lib/ads';
import AdCard from '@/components/AdCard';

const FILTERS = ['all', 'winner', 'testing', 'loser', 'unsure'];

const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'longest', label: 'Longest running' },
  { id: 'impressions', label: 'Most impressions' },
  { id: 'roas', label: 'Best ROAS' },
  { id: 'ctr', label: 'Best CTR' },
  { id: 'cpc', label: 'Lowest CPC' },
  { id: 'spend', label: 'Most spent' },
];

const WHO = [
  { id: 'all', label: 'All' },
  { id: 'ours', label: 'Ours' },
  { id: 'rivals', label: 'Rivals' },
];

const isOurs = (a) => isOwnBrand(a.brand);
const MAX_COMPARE = 4;

export default function Library() {
  // /ads?q=Brand deep-links a pre-filled search (used by the competitors page).
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get('q') || '');
  const [verdict, setVerdict] = useState('all');
  const [sort, setSort] = useState('newest');
  const [who, setWho] = useState(params.get('who') || 'all');
  const [provenOnly, setProvenOnly] = useState(params.get('proven') === '1');
  // /ads?starred=1 is a real destination, not just a chip state: the mobile nav
  // links straight into the shortlist.
  const [starredOnly, setStarredOnly] = useState(params.get('starred') === '1');
  const [recentOnly, setRecentOnly] = useState(false);
  const [country, setCountry] = useState('all');
  const [geo, setGeo] = useState('all');
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState([]); // ad objects

  useEffect(() => {
    let mounted = true;
    fetchAll((q) => q.order('created_at', { ascending: false }), 'ads').then((data) => {
      if (!mounted) return;
      setAds(data);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Tapping the nav link while already on /ads changes the query string without
  // remounting, so mirror it back into state.
  useEffect(() => {
    setStarredOnly(params.get('starred') === '1');
  }, [params]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ads.filter((a) => {
      if (who === 'ours' && !isOurs(a)) return false;
      if (who === 'rivals' && isOurs(a)) return false;
      if (verdict !== 'all' && a.verdict !== verdict) return false;
      if (provenOnly && !isProven(a)) return false;
      if (starredOnly && !isStarred(a)) return false;
      if (recentOnly && !isRecent(a)) return false;
      if (geo !== 'all' && geoStatus(a) !== geo) return false;
      if (country !== 'all' && !adCountries(a).includes(country)) return false;
      if (!term) return true;
      return [a.brand, a.hook, a.ad_copy, a.platform, ...(a.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [ads, q, verdict, who, provenOnly, starredOnly, recentOnly, country, geo]);

  // Ads without the number being sorted on sink to the bottom.
  const ranked = useMemo(() => {
    const num = (a, key) => {
      const v = Number(a.metrics?.[key]);
      return Number.isFinite(v) && v > 0 ? v : null;
    };
    const desc = (get) => (a, b) => (get(b) ?? -1) - (get(a) ?? -1);
    const days = (a) => (typeof a.metrics?.days_running === 'number' ? a.metrics.days_running : null);
    const imps = (a) => num(a, 'impressions') ?? num(a, 'reach');
    if (sort === 'longest') return [...filtered].sort(desc(days));
    if (sort === 'impressions') return [...filtered].sort(desc(imps));
    if (sort === 'roas') return [...filtered].sort(desc((a) => num(a, 'roas')));
    if (sort === 'ctr') return [...filtered].sort(desc((a) => num(a, 'ctr')));
    if (sort === 'spend') return [...filtered].sort(desc((a) => num(a, 'spend')));
    if (sort === 'cpc')
      return [...filtered].sort((a, b) => (num(a, 'cpc') ?? Infinity) - (num(b, 'cpc') ?? Infinity));
    return filtered; // query already orders by newest
  }, [filtered, sort]);

  // The freshest batch floats to the top of whatever sort is active, so a new
  // drop is the first thing you see without having to touch a filter. Stable
  // partition: inside each half the chosen sort order still holds. Self-clears
  // when the next batch takes the tag.
  const sorted = useMemo(() => {
    if (recentOnly) return ranked; // already nothing but the batch
    const fresh = ranked.filter(isRecent);
    return fresh.length ? [...fresh, ...ranked.filter((a) => !isRecent(a))] : ranked;
  }, [ranked, recentOnly]);

  const provenCount = useMemo(() => ads.filter(isProven).length, [ads]);
  const starredCount = useMemo(() => ads.filter(isStarred).length, [ads]);
  const recentCount = useMemo(() => ads.filter(isRecent).length, [ads]);

  // Both geo controls are data-derived: no countries and no synced rows means
  // the sync has not run, so they stay out of the row entirely (same rule the
  // New pill uses with recentCount).
  const countries = useMemo(() => countryOptions(ads), [ads]);
  const geoChecked = useMemo(() => ads.filter((a) => geoStatus(a) !== 'unknown').length, [ads]);

  const toggleSelect = (ad) => {
    setSelected((cur) => {
      if (cur.find((a) => a.id === ad.id)) return cur.filter((a) => a.id !== ad.id);
      if (cur.length >= MAX_COMPARE) return cur; // cap
      return [...cur, ad];
    });
  };

  const exitCompare = () => {
    setCompareMode(false);
    setSelected([]);
  };

  // Every chip in the filter rows is a thumb target first and a label second:
  // 44px tall minimum, never smaller, on every viewport.
  const pill = (active) =>
    `press flex-shrink-0 flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-2xl text-[13px] font-semibold transition-colors ${
      active ? 'bg-coral text-black' : 'bg-card border border-line text-ink-soft'
    }`;

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[1200px] mx-auto pb-24">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-[26px] sm:text-[22px] font-semibold tracking-[-0.02em] leading-tight">
            {starredOnly ? 'Starred ads' : 'Ad library'}
          </h1>
          <p className="text-ink-soft text-[13px] sm:text-[14px] tabular-nums">
            {starredOnly
              ? `${starredCount} starred`
              : `${ads.length} saved · ${provenCount} proven · ${starredCount} starred`}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={() => (compareMode ? exitCompare() : setCompareMode(true))}
            aria-pressed={compareMode}
            className={`press flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-3 sm:px-3.5 rounded-2xl font-semibold transition-colors ${
              compareMode ? 'bg-ink text-black' : 'bg-card border border-line text-ink-soft'
            }`}
          >
            <Scales size={18} weight="bold" />
            <span className="hidden sm:inline">{compareMode ? 'Cancel' : 'Compare'}</span>
          </button>
          <Link
            to="/ads/add"
            aria-label="Add ad"
            className="press flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-2xl bg-coral text-black font-semibold shadow-cta"
          >
            <PlusCircle size={20} weight="bold" />
            <span className="hidden sm:inline">Add ad</span>
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 min-h-[44px] bg-card border border-line rounded-2xl px-3">
          <MagnifyingGlass size={18} className="text-ink-soft flex-shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search brand, hook, copy, tags..."
            className="w-full min-w-0 py-2.5 bg-transparent focus:outline-none text-[14px]"
          />
        </div>
        <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0">
          {WHO.map((w) => (
            <button
              key={w.id}
              onClick={() => setWho(w.id)}
              className={`press flex-shrink-0 min-h-[44px] px-3.5 rounded-2xl text-[13px] font-semibold transition-colors ${
                who === w.id ? 'bg-ink text-black' : 'bg-card border border-line text-ink-soft'
              }`}
            >
              {w.label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort ads"
            className="flex-shrink-0 min-h-[44px] px-3 rounded-2xl text-[13px] font-semibold bg-card border border-line text-ink-soft focus:outline-none focus:border-coral"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick filters. Sticks to the top of the scroll on phones so the row you
          steer with never scrolls out of reach; static from sm up. */}
      <div className="sticky top-0 z-30 sm:static flex gap-1.5 scroll-x -mx-5 px-5 py-2 sm:py-0 sm:mx-0 sm:px-0 mb-4 sm:mb-5 bg-cream/85 backdrop-blur-xl sm:bg-transparent sm:backdrop-blur-none">
        {/* Starred leads the row on purpose: it is the shortlist you actually
            come back for, so it is one tap from anywhere in the list. */}
        <button
          onClick={() => setStarredOnly((v) => !v)}
          aria-pressed={starredOnly}
          className={`press flex-shrink-0 flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-2xl text-[13px] font-semibold transition-colors ${
            starredOnly
              ? 'bg-amber-400 text-black'
              : 'bg-card border border-line text-ink-soft'
          }`}
        >
          <Star size={16} weight={starredOnly ? 'fill' : 'bold'} />
          Starred
          {starredCount > 0 && (
            <span className={`tabular-nums ${starredOnly ? 'text-black/60' : 'text-ink-soft/70'}`}>
              {starredCount}
            </span>
          )}
        </button>
        {/* Newest batch. Only worth a slot while a batch is actually flagged. */}
        {recentCount > 0 && (
          <button onClick={() => setRecentOnly((v) => !v)} aria-pressed={recentOnly} className={pill(recentOnly)}>
            <ClockCounterClockwise size={15} weight="bold" /> New{' '}
            <span className="tabular-nums">{recentCount}</span>
          </button>
        )}
        <button onClick={() => setProvenOnly((v) => !v)} aria-pressed={provenOnly} className={pill(provenOnly)}>
          <Trophy size={15} weight="bold" /> Proven
        </button>
        <span className="w-px bg-line flex-shrink-0 mx-1 my-1.5" />
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setVerdict(f)}
            aria-pressed={verdict === f}
            className={`press flex-shrink-0 flex items-center min-h-[44px] px-3.5 rounded-2xl text-[13px] font-semibold capitalize transition-colors ${
              verdict === f ? 'bg-coral text-black' : 'bg-card border border-line text-ink-soft'
            }`}
          >
            {f}
          </button>
        ))}
        {/* Geo. Hidden until sync-geo has written something, the same way the
            New pill only shows while a batch is flagged - an empty country
            picker is just noise in the row. */}
        {(countries.length > 0 || geoChecked > 0) && (
          <span className="w-px bg-line flex-shrink-0 mx-1 my-1.5" />
        )}
        {countries.length > 0 && (
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Filter by country"
            className={`flex-shrink-0 min-h-[44px] px-3 rounded-2xl text-[13px] font-semibold focus:outline-none ${
              country === 'all'
                ? 'bg-card border border-line text-ink-soft focus:border-coral'
                : 'bg-coral text-black'
            }`}
          >
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
        )}
        {geoChecked > 0 && (
          <select
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            aria-label="Filter by location data"
            className={`flex-shrink-0 min-h-[44px] px-3 rounded-2xl text-[13px] font-semibold focus:outline-none ${
              geo === 'all'
                ? 'bg-card border border-line text-ink-soft focus:border-coral'
                : 'bg-coral text-black'
            }`}
          >
            <option value="all">Any geo</option>
            {GEO_STATUS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {compareMode && (
        <p className="text-[13px] text-ink-soft mb-3">
          Pick up to {MAX_COMPARE} ads to compare side by side.
        </p>
      )}

      {loading ? (
        <p className="text-ink-soft">Loading...</p>
      ) : sorted.length === 0 ? (
        <div className="text-center py-20 text-ink-soft">
          <p className="mb-3">No ads match.</p>
          {(provenOnly || starredOnly || recentOnly || verdict !== 'all' || country !== 'all' || geo !== 'all' || q) && (
            <button
              onClick={() => {
                setProvenOnly(false);
                setStarredOnly(false);
                setRecentOnly(false);
                setVerdict('all');
                setCountry('all');
                setGeo('all');
                setQ('');
              }}
              className="press inline-flex items-center min-h-[44px] px-4 rounded-2xl border border-line text-coral-dark font-semibold"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {sorted.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              selectable={compareMode}
              selected={compareMode && selected.some((a) => a.id === ad.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* Floating compare bar */}
      {compareMode && selected.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-5 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-cream via-cream to-transparent sm:pl-64">
          <div className="max-w-[900px] mx-auto flex items-center gap-3 bg-ink text-black rounded-2xl shadow-cardhover px-4 py-3">
            <div className="flex -space-x-2 flex-shrink-0">
              {selected.slice(0, 4).map((a) => (
                <span
                  key={a.id}
                  className="w-8 h-8 rounded-full bg-card/15 border border-white/30 flex items-center justify-center text-[10px] font-semibold"
                  title={a.brand}
                >
                  {(a.brand || '?').slice(0, 2)}
                </span>
              ))}
            </div>
            <p className="text-[13px] font-medium flex-1 min-w-0 truncate">
              {selected.length} selected
            </p>
            <button
              onClick={() => setSelected([])}
              className="press w-11 h-11 -mx-1 rounded-full hover:bg-card/10 flex items-center justify-center flex-shrink-0"
              aria-label="Clear selection"
            >
              <X size={16} weight="bold" />
            </button>
            <button
              disabled={selected.length < 2}
              onClick={() => navigate(`/compare?ids=${selected.map((a) => a.id).join(',')}`)}
              className="press inline-flex items-center min-h-[44px] px-4 rounded-xl bg-coral text-black text-[13px] font-semibold disabled:opacity-40 flex-shrink-0"
            >
              Compare {selected.length}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
