import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Check, ArrowSquareOut } from '@phosphor-icons/react';
import { useTeam } from '@/contexts/TeamContext';
import Pill from '@/components/Pill';
import { setStarred, isStarred, reachRating, fmtReach, creativeLink } from '@/lib/ads';

const VERDICT = {
  winner: { label: 'Winner', tone: 'good' },
  loser: { label: 'Loser', tone: 'bad' },
  testing: { label: 'Testing', tone: 'warn' },
  unsure: { label: 'Unsure', tone: 'neutral' },
};

// AdCard is text-first on purpose: no creative thumbnail. It answers "is this ad
// good or bad, and is it still running" at a glance, then links out to the Ad
// Library when you actually want to see the creative. Supports an optional
// selection mode (for Compare): when `selectable` is set the whole card toggles
// selection instead of navigating.
export default function AdCard({ ad, selectable = false, selected = false, onToggleSelect }) {
  const { displayName } = useTeam();
  const v = VERDICT[ad.verdict] || VERDICT.unsure;
  const [starred, setStar] = useState(isStarred(ad));

  const toggleStar = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !starred;
    setStar(next); // optimistic
    ad.metrics = { ...(ad.metrics || {}), starred: next };
    await setStarred(ad, next);
  };

  const openCreative = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(creativeLink(ad), '_blank', 'noopener,noreferrer');
  };

  const m = ad.metrics || {};
  const rating = reachRating(ad);
  const reach = fmtReach(ad);
  const metricBits = [
    Number.isFinite(+m.ctr) && +m.ctr > 0 && `${(+m.ctr).toFixed(1)}% CTR`,
    Number.isFinite(+m.cpc) && +m.cpc > 0 && `€${(+m.cpc).toFixed(2)} CPC`,
    Number.isFinite(+m.spend) && +m.spend > 0 && `€${(+m.spend).toFixed(0)} spent`,
    Number.isFinite(+m.clicks) && +m.clicks > 0 && `${+m.clicks} clicks`,
  ].filter(Boolean);

  const body = (
    <div className="p-3.5">
      {/* name + verdict + star */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-[14px] truncate">{ad.brand || 'Untitled'}</p>
          <p className="text-[12px] text-ink-soft truncate mt-0.5">
            {[ad.platform, ad.hook].filter(Boolean).join(' · ') || 'No hook noted'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Pill tone={v.tone}>{v.label}</Pill>
          <button
            type="button"
            onClick={toggleStar}
            aria-label={starred ? 'Unstar' : 'Star'}
            aria-pressed={starred}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              starred ? 'bg-amber-400 text-black' : 'bg-cream text-ink-soft hover:text-amber-400'
            }`}
          >
            <Star size={15} weight={starred ? 'fill' : 'bold'} />
          </button>
        </div>
      </div>

      {/* the glance verdict: reach rating + how many saw it */}
      {rating && (
        <div className="flex items-center gap-2 mt-2.5">
          <span className={`text-[12px] font-extrabold tracking-wide px-2.5 py-1 rounded-lg ${rating.tone}`}>
            {rating.label}
          </span>
          {reach && (
            <span className="text-[12px] text-ink-soft">
              <span className="font-mono font-semibold text-ink tabular-nums">{reach}</span> reach
            </span>
          )}
        </div>
      )}

      {/* running status */}
      {typeof m.days_running === 'number' && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium mt-2">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.live ? 'bg-emerald-400' : 'bg-ink-soft/40'}`} />
          <span className={m.live ? 'text-emerald-400' : 'text-ink-soft'}>
            {m.live ? 'running' : 'stopped'} · {m.days_running}d
          </span>
        </p>
      )}

      {/* supporting numbers, de-emphasised */}
      {metricBits.length > 0 && (
        <p className="font-mono text-[11px] text-ink-soft mt-1.5 tabular-nums">{metricBits.join('  ·  ')}</p>
      )}

      {Array.isArray(ad.tags) && ad.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {ad.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-cream text-ink-soft">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* see the creative (Ad Library, never Foreplay) */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-line">
        <button
          type="button"
          onClick={openCreative}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-coral-dark hover:underline"
        >
          Ad Library <ArrowSquareOut size={13} weight="bold" className="flex-shrink-0" />
        </button>
        {ad.added_by_email && (
          <span className="text-[11px] text-ink-soft truncate">by {displayName(ad.added_by_email)}</span>
        )}
      </div>
    </div>
  );

  const selectMark = selectable && (
    <span
      className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center border-2 ${
        selected ? 'bg-coral border-coral text-black' : 'bg-card/85 border-line text-transparent'
      }`}
    >
      <Check size={14} weight="bold" />
    </span>
  );

  const shell =
    'group relative block bg-card rounded-xl3 border shadow-card hover:shadow-cardhover transition-all overflow-hidden';

  if (selectable) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggleSelect?.(ad)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggleSelect?.(ad)}
        className={`${shell} cursor-pointer ${selected ? 'border-coral ring-2 ring-coral/30' : 'border-line'}`}
      >
        {selectMark}
        {body}
      </div>
    );
  }

  return (
    <Link to={`/ad/${ad.id}`} className={`${shell} border-line`}>
      {body}
    </Link>
  );
}
