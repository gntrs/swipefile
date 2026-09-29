import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Check, ArrowSquareOut } from '@phosphor-icons/react';
import { useTeam } from '@/contexts/TeamContext';
import Pill from '@/components/Pill';
import { TEAM_MODE } from '@/lib/modules';
import { angleOf, angleLabel } from '@/lib/angles';
import { setStarred, isStarred, isRecent, RECENT_TAG, reachRating, fmtReach, fmtEuReach, adCountries, countryName } from '@/lib/ads';

const VERDICT = {
  winner: { label: 'Winner', tone: 'good' },
  loser: { label: 'Loser', tone: 'bad' },
  testing: { label: 'Testing', tone: 'warn' },
  unsure: { label: 'Unsure', tone: 'neutral' },
};

// Permalink to THIS ad, never to the advertiser page. The importer writes
// metrics.ad_permalink; older rows only have metrics.source_url. If neither is
// there we render no link at all rather than guessing one from the page name,
// because a link that lands on the wrong ad is worse than no link.
function adPermalink(ad) {
  const m = ad?.metrics || {};
  const url = m.ad_permalink || m.source_url;
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

function fmtNum(n) {
  const v = +n;
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}m`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

// AdCard is text-first on purpose: no creative thumbnail. It answers "is this ad
// good or bad, and is it still running" at a glance, then links out to the exact
// ad when you actually want to see the creative. Supports an optional selection
// mode (for bulk actions and Compare): when `selectable` is set the whole card
// toggles selection instead of navigating. `focused` draws the keyboard ring;
// `onAdChange` hears about a star toggled on the card, so a list can keep its
// copy of the row in step.
export default function AdCard({ ad, selectable = false, selected = false, onToggleSelect, focused = false, onAdChange }) {
  const { displayName } = useTeam();
  const v = VERDICT[ad.verdict] || VERDICT.unsure;
  const [starred, setStar] = useState(isStarred(ad));
  // Bumped on every toggle so the icon remounts and replays its spring.
  const [pop, setPop] = useState(0);
  // The list may change the star too (a key press, a bulk action).
  const propStarred = isStarred(ad);
  useEffect(() => setStar(propStarred), [propStarred]);

  const toggleStar = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !starred;
    setStar(next); // optimistic
    setPop((n) => n + 1);
    const ok = await setStarred(ad, next);
    if (!ok) {
      setStar(!next);
      return;
    }
    onAdChange?.({ ...ad, metrics: { ...(ad.metrics || {}), starred: next } });
  };

  const m = ad.metrics || {};
  const rating = reachRating(ad);
  // The batch tag has its own badge up top, so keep it out of the grey pills.
  const tags = (ad.tags || []).filter((t) => t !== RECENT_TAG);
  const reach = fmtReach(ad);
  const perDay = fmtNum(m.reach_per_day);
  const days = Number.isFinite(+m.days_running) ? +m.days_running : null;
  const euR = fmtEuReach(ad);
  const geoCodes = adCountries(ad);
  const permalink = adPermalink(ad);
  const angle = angleOf(ad);
  const metricBits = [
    Number.isFinite(+m.ctr) && +m.ctr > 0 && `${(+m.ctr).toFixed(1)}% CTR`,
    Number.isFinite(+m.cpc) && +m.cpc > 0 && `€${(+m.cpc).toFixed(2)} CPC`,
    Number.isFinite(+m.spend) && +m.spend > 0 && `€${(+m.spend).toFixed(0)} spent`,
    Number.isFinite(+m.clicks) && +m.clicks > 0 && `${+m.clicks} clicks`,
  ].filter(Boolean);

  // The three numbers that decide whether an ad is worth copying, in the order
  // you read them: how many people saw it, how hard it is pushed, how long it
  // has survived. Anything missing simply drops out of the row.
  const stats = [
    reach && { k: 'reach', label: 'Reach', value: reach },
    perDay && { k: 'perday', label: 'Per day', value: perDay },
    days !== null && { k: 'days', label: 'Days live', value: String(days) },
  ].filter(Boolean);

  const star = (
    <button
      type="button"
      onClick={toggleStar}
      aria-label={starred ? 'Remove star' : 'Star this ad'}
      aria-pressed={starred}
      className="press-solo relative flex-shrink-0 w-11 h-11 -mr-2.5 -mt-2.5 flex items-center justify-center rounded-full"
    >
      {/* Halo only fires on the way in, and only once per commit. */}
      {starred && (
        <span
          key={`halo-${pop}`}
          aria-hidden="true"
          className="star-halo absolute w-8 h-8 rounded-full bg-amber-400 pointer-events-none"
        />
      )}
      <span
        key={pop}
        className={`press-solo-face relative w-8 h-8 rounded-full flex items-center justify-center ${pop > 0 ? 'star-pop' : ''} ${
          starred ? 'text-amber-400' : 'text-ink-soft group-hover:text-ink'
        }`}
      >
        <Star size={20} weight={starred ? 'fill' : 'bold'} />
      </span>
    </button>
  );

  const content = (
    <div className={`flex-1 flex flex-col px-4 pt-3.5 pb-4 ${selectable ? 'pl-12' : ''}`}>
      {/* who it is, and the one control that matters */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 min-h-[24px]">
          <p className="text-[13px] font-semibold text-ink-soft truncate">{ad.brand || 'Untitled'}</p>
          {isRecent(ad) && (
            <span className="flex-shrink-0 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.12em] px-1.5 py-1 rounded bg-accent text-black">
              New
            </span>
          )}
        </div>
        {star}
      </div>

      {/* what it says: the hook is the thing you came to read */}
      <p className={`text-[16px] sm:text-[15px] leading-snug font-medium mt-1 break-words line-clamp-3 ${ad.hook ? 'text-ink' : 'text-ink-soft'}`}>
        {ad.hook || 'No hook noted'}
      </p>

      {/* the glance verdict: what we called it, how it performed, is it alive */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
        <Pill tone={v.tone}>{v.label}</Pill>
        {rating && (
          <span className={`font-mono text-[11px] font-medium uppercase tracking-[0.12em] ${rating.tone}`}>{rating.label}</span>
        )}
        {days !== null && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.live ? 'bg-emerald-400' : 'bg-ink-soft/50'}`} />
            <span className={m.live ? 'text-emerald-600' : 'text-ink-soft'}>{m.live ? 'running' : 'stopped'}</span>
          </span>
        )}
      </div>
      {(ad.platform || angle) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft min-w-0">
          {ad.platform && <span className="truncate">{ad.platform}</span>}
          {angle && <span className="truncate">{angleLabel(angle)}</span>}
        </p>
      )}

      {/* the numbers sit at the foot of the card, so a row of cards lines up */}
      <div className="mt-auto">
        {stats.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 pt-4">
            {stats.map((s) => (
              <div key={s.k} className="min-w-0">
                <p className="font-mono text-[18px] sm:text-[16px] font-medium tabular-nums leading-none truncate">
                  {s.value}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-soft mt-1.5 truncate">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* EU transparency: reach inside the EU + where it runs. Only shows once
            sync-geo has written eu_reach / countries, so competitor rows with no
            geo data render exactly as before. */}
        {(euR || geoCodes.length > 0) && (
          <p className="flex items-center gap-1.5 font-mono text-[11px] mt-3 text-ink-soft min-w-0">
            {euR && (
              <span className="flex-shrink-0">
                <span className="text-ink tabular-nums">{euR}</span> EU reach
              </span>
            )}
            {euR && geoCodes.length > 0 && <span className="text-ink-soft/40">·</span>}
            {geoCodes.length > 0 && (
              <span className="truncate" title={geoCodes.map(countryName).join(', ')}>
                {geoCodes.slice(0, 3).join(' ')}
                {geoCodes.length > 3 && ` +${geoCodes.length - 3}`}
              </span>
            )}
          </p>
        )}

        {/* supporting numbers, de-emphasised */}
        {metricBits.length > 0 && (
          <p className="font-mono text-[11px] leading-relaxed text-ink-soft pt-4 tabular-nums break-words">{metricBits.join('  ·  ')}</p>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {tags.slice(0, 3).map((t) => (
              <span key={t} className="text-[12px] leading-5 px-1.5 rounded bg-white/[0.06] text-ink-soft max-w-full truncate">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Kept out of the card link on purpose: an anchor cannot legally nest inside
  // another anchor, so the footer sits beside the Link rather than inside it.
  // Who added it only matters when several people share the library.
  const byName = TEAM_MODE && ad.added_by_email ? displayName(ad.added_by_email) : null;
  const footer = (permalink || byName) && (
    <div className="mx-4 flex items-center justify-between gap-2 border-t border-white/[0.06] min-w-0">
      {/* Opens the exact ad, never the advertiser page. Rendered only when a
          real permalink exists on the row. */}
      {permalink ? (
        <a
          href={permalink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="press-solo -ml-1 inline-flex items-center gap-1.5 min-h-[44px] px-1 text-[13px] font-semibold text-ink-soft hover:text-ink"
        >
          <span className="press-solo-face inline-flex items-center gap-1.5">
            Open ad <ArrowSquareOut size={14} weight="bold" className="flex-shrink-0" />
          </span>
        </a>
      ) : (
        <span />
      )}
      {byName && <span className="font-mono text-[11px] text-ink-soft truncate">by {byName}</span>}
    </div>
  );

  const selectMark = selectable && (
    <span
      className={`absolute top-3.5 left-3.5 z-10 w-6 h-6 rounded-full flex items-center justify-center border-2 ${
        selected ? 'bg-accent border-accent text-black' : 'border-ink-soft/50 text-transparent'
      }`}
    >
      <Check size={14} weight="bold" />
    </span>
  );

  const shell = `press group relative flex flex-col bg-card rounded-xl3 shadow-card hover:bg-card-hi transition-colors overflow-hidden ${
    focused ? 'ring-2 ring-accent' : ''
  }`;

  if (selectable) {
    return (
      <div
        data-ad-id={ad.id}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => onToggleSelect?.(ad)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggleSelect?.(ad)}
        className={`${shell} cursor-pointer ${selected ? 'ring-2 ring-accent bg-card-hi' : ''}`}
      >
        {selectMark}
        {content}
        {footer}
      </div>
    );
  }

  return (
    <div data-ad-id={ad.id} className={shell}>
      <Link to={`/ad/${ad.id}`} className="flex-1 flex flex-col rounded-xl3 focus-visible:outline-offset-[-2px]">
        {content}
      </Link>
      {footer}
    </div>
  );
}
