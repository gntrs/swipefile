import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, ArrowSquareOut } from '@phosphor-icons/react';
import { isOwnBrand } from '@/lib/ads';

// "What rivals keep paying for." A brand keeps spending on what works, so an ad
// that has been LIVE for months is a battle-tested play. This ranks the
// longest-running competitor ads so we can study and beat the angle - the
// single most actionable competitive signal in the data (days_running is the
// most reliably populated field; reach/spend on rivals is not).
//
// Chart form: magnitude ranking -> horizontal bars, sorted desc, one series
// (days running) so the title names it and no legend is needed. Rival
// magnitude wears slate (never green/red - those are reserved for our
// winner/loser verdicts).

const isRival = (a) => !isOwnBrand(a.brand);
const days = (a) => (typeof a.metrics?.days_running === 'number' ? a.metrics.days_running : null);

// A usable angle, or null. The board's job is to steal the angle, so a row
// with no visible hook is dead weight - we drop those.
const hookOf = (a) => {
  const h = (a.hook || '').trim();
  if (h && h.toLowerCase() !== (a.brand || '').trim().toLowerCase()) return h;
  const firstLine = (a.ad_copy || '').split('\n').map((l) => l.trim()).find(Boolean);
  return firstLine || null;
};

export default function ProvenPlays({ ads }) {
  const [scope, setScope] = useState('all'); // 'all' | 'live'

  const { rows, max, brands } = useMemo(() => {
    let pool = ads.filter((a) => isRival(a) && days(a) != null && hookOf(a));
    if (scope === 'live') pool = pool.filter((a) => a.metrics?.live);
    // Dedupe by brand+hook so five copies of the same Smart Tales ad don't fill
    // the board; keep the longest-running instance of each play.
    const seen = new Map();
    for (const a of pool) {
      const key = `${(a.brand || '').toLowerCase()}|${hookOf(a).toLowerCase()}`;
      const prev = seen.get(key);
      if (!prev || days(a) > days(prev)) seen.set(key, a);
    }
    const ranked = [...seen.values()].sort((x, y) => days(y) - days(x)).slice(0, 8);
    const brandSet = new Set(ranked.map((a) => (a.brand || '').trim()));
    return { rows: ranked, max: Math.max(1, ...ranked.map(days)), brands: brandSet.size };
  }, [ads, scope]);

  return (
    <div className="bg-card rounded-xl3 border border-line shadow-card p-5 mb-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
            <Trophy size={17} weight="bold" />
          </span>
          <div>
            <h2 className="font-semibold text-[15px]">What rivals keep paying for</h2>
            <p className="text-ink-soft text-[12px]">
              Their longest-running ads = battle-tested. Steal the angle.
            </p>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {[
            ['all', 'All'],
            ['live', 'Live now'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setScope(id)}
              className={`px-2.5 py-1.5 rounded-xl text-[12px] font-semibold transition-colors ${
                scope === id ? 'bg-ink text-black' : 'bg-card border border-line text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-ink-soft text-[13px] mt-3">
          No competitor run-time data yet. It fills in from the Ad Library import.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5 mt-3">
          {rows.map((a, i) => {
            const d = days(a);
            const live = a.metrics?.live;
            return (
              <Link key={a.id} to={`/ad/${a.id}`} className="block group">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-mono text-[11px] text-ink-soft/60 tabular-nums w-4 flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-semibold truncate group-hover:text-coral-dark transition-colors">
                    {a.brand || 'Untitled'}
                  </span>
                  {live && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-blue-600 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> live
                    </span>
                  )}
                  <span className="font-mono text-[12px] font-semibold text-ink tabular-nums ml-auto flex-shrink-0">
                    {d}d
                  </span>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <div className="flex-1 h-2.5 rounded-full bg-card overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white/25"
                      style={{ width: `${Math.max(3, (d / max) * 100)}%` }}
                    />
                  </div>
                </div>
                <p
                  className="text-[12px] text-ink-soft truncate pl-6 mt-0.5 group-hover:text-ink transition-colors"
                  title={hookOf(a)}
                >
                  {hookOf(a)}
                </p>
              </Link>
            );
          })}
          <p className="text-[11px] text-ink-soft mt-1 flex items-center gap-1.5">
            <ArrowSquareOut size={12} weight="bold" />
            {brands} brand{brands > 1 ? 's' : ''} in the top plays. Tap any to open the ad.
          </p>
        </div>
      )}
    </div>
  );
}
