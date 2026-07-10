import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PlusCircle, MagnifyingGlass, Star, Trophy, Scales, X } from '@phosphor-icons/react';
import { fetchAll } from '@/lib/supabase';
import { isProven, isStarred, isOwnBrand } from '@/lib/ads';
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
  const [starredOnly, setStarredOnly] = useState(false);
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

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ads.filter((a) => {
      if (who === 'ours' && !isOurs(a)) return false;
      if (who === 'rivals' && isOurs(a)) return false;
      if (verdict !== 'all' && a.verdict !== verdict) return false;
      if (provenOnly && !isProven(a)) return false;
      if (starredOnly && !isStarred(a)) return false;
      if (!term) return true;
      return [a.brand, a.hook, a.ad_copy, a.platform, ...(a.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [ads, q, verdict, who, provenOnly, starredOnly]);

  // Ads without the number being sorted on sink to the bottom.
  const sorted = useMemo(() => {
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

  const provenCount = useMemo(() => ads.filter(isProven).length, [ads]);
  const starredCount = useMemo(() => ads.filter(isStarred).length, [ads]);

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

  const pill = (active) =>
    `flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl text-[13px] font-semibold transition-colors ${
      active ? 'bg-coral text-black' : 'bg-card border border-line text-ink-soft'
    }`;

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[1200px] mx-auto pb-24">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Ad library</h1>
          <p className="text-ink-soft text-[14px]">
            {ads.length} saved · {provenCount} proven · {starredCount} starred
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (compareMode ? exitCompare() : setCompareMode(true))}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl font-semibold transition-colors ${
              compareMode ? 'bg-ink text-black' : 'bg-card border border-line text-ink-soft'
            }`}
          >
            <Scales size={18} weight="bold" /> {compareMode ? 'Cancel' : 'Compare'}
          </button>
          <Link
            to="/ads/add"
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-coral text-black font-semibold shadow-cta active:scale-[0.98] transition-transform"
          >
            <PlusCircle size={20} weight="bold" /> Add ad
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-card border border-line rounded-2xl px-3">
          <MagnifyingGlass size={18} className="text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search brand, hook, copy, tags..."
            className="w-full py-2.5 bg-transparent focus:outline-none text-[14px]"
          />
        </div>
        <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0">
          {WHO.map((w) => (
            <button
              key={w.id}
              onClick={() => setWho(w.id)}
              className={`flex-shrink-0 px-3 py-2 rounded-2xl text-[13px] font-semibold transition-colors ${
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
            className="flex-shrink-0 px-3 py-2 rounded-2xl text-[13px] font-semibold bg-card border border-line text-ink-soft focus:outline-none focus:border-coral"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick filters: the winners-first row + verdicts */}
      <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0 mb-5">
        <button onClick={() => setProvenOnly((v) => !v)} className={pill(provenOnly)}>
          <Trophy size={15} weight="bold" /> Proven
        </button>
        <button onClick={() => setStarredOnly((v) => !v)} className={pill(starredOnly)}>
          <Star size={15} weight={starredOnly ? 'fill' : 'bold'} /> Starred
        </button>
        <span className="w-px bg-line flex-shrink-0 mx-1 my-1.5" />
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setVerdict(f)}
            className={`flex-shrink-0 px-3 py-2 rounded-2xl text-[13px] font-semibold capitalize transition-colors ${
              verdict === f ? 'bg-coral text-black' : 'bg-card border border-line text-ink-soft'
            }`}
          >
            {f}
          </button>
        ))}
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
          {(provenOnly || starredOnly || verdict !== 'all' || q) && (
            <button
              onClick={() => {
                setProvenOnly(false);
                setStarredOnly(false);
                setVerdict('all');
                setQ('');
              }}
              className="text-coral-dark font-semibold"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
        <div className="fixed bottom-0 inset-x-0 z-40 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-cream via-cream to-transparent sm:pl-64">
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
              className="w-8 h-8 rounded-full hover:bg-card/10 flex items-center justify-center flex-shrink-0"
              aria-label="Clear selection"
            >
              <X size={16} weight="bold" />
            </button>
            <button
              disabled={selected.length < 2}
              onClick={() => navigate(`/compare?ids=${selected.map((a) => a.id).join(',')}`)}
              className="px-4 py-2 rounded-xl bg-coral text-black text-[13px] font-semibold disabled:opacity-40 flex-shrink-0"
            >
              Compare {selected.length}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
