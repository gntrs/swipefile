import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Star } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useMediaUrl } from '@/lib/media';
import { setStarred, isStarred } from '@/lib/ads';

const num = (a, k) => {
  const v = Number(a?.metrics?.[k]);
  return Number.isFinite(v) && v > 0 ? v : null;
};
const fmtEur = (v) => (v == null ? '-' : `€${v.toFixed(2)}`);
const fmtPct = (v) => (v == null ? '-' : `${v.toFixed(2)}%`);
const fmtNum = (v) => (v == null ? '-' : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`);

// Metric rows. `best` = 'max' (higher wins) or 'min' (lower wins); the winning
// cell in each row gets highlighted so the pattern jumps out.
const ROWS = [
  { key: 'ctr', label: 'CTR', get: (a) => num(a, 'ctr'), fmt: fmtPct, best: 'max' },
  { key: 'cpc', label: 'CPC', get: (a) => num(a, 'cpc'), fmt: fmtEur, best: 'min' },
  { key: 'spend', label: 'Spend', get: (a) => num(a, 'spend'), fmt: fmtEur, best: null },
  { key: 'roas', label: 'ROAS', get: (a) => num(a, 'roas'), fmt: (v) => (v == null ? '-' : v.toFixed(2)), best: 'max' },
  { key: 'reach', label: 'Reach / impressions', get: (a) => num(a, 'impressions') ?? num(a, 'reach'), fmt: fmtNum, best: 'max' },
  { key: 'days', label: 'Days running', get: (a) => (typeof a?.metrics?.days_running === 'number' ? a.metrics.days_running : null), fmt: (v) => (v == null ? '-' : `${v}d`), best: 'max' },
];

function AdThumb({ ad }) {
  const src = useMediaUrl(ad.media_path);
  return (
    <div className="aspect-[4/5] w-full bg-cream rounded-xl overflow-hidden flex items-center justify-center">
      {src ? (
        ad.format === 'video' ? (
          <video src={src} muted loop playsInline className="w-full h-full object-cover" />
        ) : (
          <img src={src} alt={ad.brand || 'ad'} className="w-full h-full object-cover" />
        )
      ) : (
        <span className="text-ink-soft text-[12px]">No media</span>
      )}
    </div>
  );
}

export default function Compare() {
  const [params] = useSearchParams();
  const ids = (params.get('ids') || '').split(',').filter(Boolean);
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, force] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!ids.length) {
      setLoading(false);
      return;
    }
    db
      .from('ads')
      .select('*')
      .in('id', ids)
      .then(({ data }) => {
        if (!mounted) return;
        // preserve the order the user picked
        const byId = new Map((data || []).map((a) => [a.id, a]));
        setAds(ids.map((id) => byId.get(id)).filter(Boolean));
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('ids')]);

  const toggleStar = async (ad) => {
    const next = !isStarred(ad);
    ad.metrics = { ...(ad.metrics || {}), starred: next };
    force((n) => n + 1);
    await setStarred(ad, next);
  };

  // Best cell index per row, for highlighting.
  const bestIndex = (row) => {
    if (!row.best) return -1;
    let idx = -1;
    let val = row.best === 'max' ? -Infinity : Infinity;
    ads.forEach((a, i) => {
      const v = row.get(a);
      if (v == null) return;
      if ((row.best === 'max' && v > val) || (row.best === 'min' && v < val)) {
        val = v;
        idx = i;
      }
    });
    return idx;
  };

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/ads" className="w-9 h-9 rounded-xl border border-line flex items-center justify-center text-ink-soft hover:bg-card">
          <ArrowLeft size={18} weight="bold" />
        </Link>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Compare</h1>
          <p className="text-ink-soft text-[14px]">{ads.length} ads side by side · best in each row highlighted</p>
        </div>
      </div>

      {loading ? (
        <p className="text-ink-soft">Loading...</p>
      ) : ads.length < 2 ? (
        <div className="text-center py-20 text-ink-soft">
          <p className="mb-3">Pick at least 2 ads to compare.</p>
          <Link to="/ads" className="text-coral-dark font-semibold">Back to the library</Link>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
          <table className="border-collapse min-w-full">
            <thead>
              <tr>
                <th className="sticky left-0 bg-cream z-10 w-28" />
                {ads.map((a) => (
                  <th key={a.id} className="p-2 align-top min-w-[160px]">
                    <div className="bg-card rounded-xl3 border border-line shadow-card p-2">
                      <div className="relative">
                        <AdThumb ad={a} />
                        <button
                          onClick={() => toggleStar(a)}
                          aria-label="Star"
                          className={`absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur ${
                            isStarred(a) ? 'bg-amber-400 text-white' : 'bg-card/85 text-ink-soft'
                          }`}
                        >
                          <Star size={14} weight={isStarred(a) ? 'fill' : 'bold'} />
                        </button>
                      </div>
                      <Link to={`/ad/${a.id}`} className="block mt-2 font-semibold text-[13px] truncate hover:text-coral-dark">
                        {a.brand || 'Untitled'}
                      </Link>
                      <p className="text-[11px] text-ink-soft truncate">{a.platform}</p>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const best = bestIndex(row);
                return (
                  <tr key={row.key} className="border-t border-line">
                    <td className="sticky left-0 bg-cream z-10 text-[12px] font-medium text-ink-soft pr-3 py-2 align-middle">
                      {row.label}
                    </td>
                    {ads.map((a, i) => (
                      <td key={a.id} className="px-2 py-2 text-center align-middle">
                        <span
                          className={`font-mono text-[14px] tabular-nums ${
                            i === best
                              ? 'font-bold text-emerald-700 bg-mint/25 px-2 py-0.5 rounded-lg'
                              : 'text-ink'
                          }`}
                        >
                          {row.fmt(row.get(a))}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
              {/* Hook + copy rows, left-aligned text */}
              <tr className="border-t border-line">
                <td className="sticky left-0 bg-cream z-10 text-[12px] font-medium text-ink-soft pr-3 py-2 align-top">Hook</td>
                {ads.map((a) => (
                  <td key={a.id} className="px-2 py-2 text-[13px] align-top">{a.hook || '-'}</td>
                ))}
              </tr>
              <tr className="border-t border-line">
                <td className="sticky left-0 bg-cream z-10 text-[12px] font-medium text-ink-soft pr-3 py-2 align-top">Copy</td>
                {ads.map((a) => (
                  <td key={a.id} className="px-2 py-2 text-[12px] text-ink-soft align-top whitespace-pre-wrap max-w-[240px]">
                    {a.ad_copy ? (a.ad_copy.length > 280 ? `${a.ad_copy.slice(0, 280)}...` : a.ad_copy) : '-'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
