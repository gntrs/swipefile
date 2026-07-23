import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Check, ArrowSquareOut } from '@phosphor-icons/react';
import { useTeam } from '@/contexts/TeamContext';
import Pill from '@/components/Pill';
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
// mode (for Compare): when `selectable` is set the whole card toggles selection
// instead of navigating.
export default function AdCard({ ad, selectable = false, selected = false, onToggleSelect }) {
  const { displayName } = useTeam();
  const v = VERDICT[ad.verdict] || VERDICT.unsure;
  const [starred, setStar] = useState(isStarred(ad));
  // Bumped on every toggle so the icon remounts and replays its spring.
  const [pop, setPop] = useState(0);

  const toggleStar = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !starred;
    setStar(next); // optimistic
    setPop((n) => n + 1);
    ad.metrics = { ...(ad.metrics || {}), starred: next };
    await setStarred(ad, next);
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
      className="press-solo relative flex-shrink-0 w-11 h-11 -mr-2 -mt-1.5 flex items-center justify-center rounded-full"
    >
      {/* Halo only fires on the way in, and only once per commit. */}
      {starred && (
        <span
          key={`halo-${pop}`}
          aria-hidden="true"
          className="star-halo absolute w-9 h-9 rounded-full bg-amber-400 pointer-events-none"
        />
      )}
      <span
        key={pop}
        className={`press-solo-face relative w-9 h-9 rounded-full flex items-center justify-center ${pop > 0 ? 'star-pop' : ''} ${
          starred
            ? 'bg-amber-400 text-black shadow-[0_0_0_3px_rgba(251,191,36,0.16)]'
            : 'bg-cream text-ink-soft ring-1 ring-inset ring-line'
        }`}
      >
        <Star size={19} weight={starred ? 'fill' : 'bold'} />
      </span>
    </button>
  );

  const content = (
    <div className={`px-4 pt-4 pb-3 sm:px-3.5 sm:pt-3.5 ${selectable ? 'pl-11 sm:pl-10' : ''}`}>
      {/* who it is, what it says, and the one control that matters */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-semibold text-[17px] sm:text-[14px] leading-tight tracking-[-0.01em] truncate">
              {ad.brand || 'Untitled'}
            </p>
            {isRecent(ad) && (
              <span className="flex-shrink-0 text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-coral text-black">
                New
              </span>
            )}
          </div>
          <p className="text-[13px] sm:text-[12px] leading-snug text-ink-soft mt-1 break-words line-clamp-2">
            {ad.hook || 'No hook noted'}
          </p>
        </div>
        {star}
      </div>

      {/* the glance verdict: how it performed, what we called it, is it alive */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-3">
        {rating && (
          <span className={`text-[12px] font-extrabold tracking-wide px-2.5 py-1 rounded-lg ${rating.tone}`}>
            {rating.label}
          </span>
        )}
        <Pill tone={v.tone}>{v.label}</Pill>
        {days !== null && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.live ? 'bg-emerald-400' : 'bg-ink-soft/40'}`} />
            <span className={m.live ? 'text-emerald-400' : 'text-ink-soft'}>{m.live ? 'running' : 'stopped'}</span>
          </span>
        )}
        {ad.platform && <span className="text-[11px] text-ink-soft truncate">{ad.platform}</span>}
      </div>

      {stats.length > 0 && (
        <div className="flex gap-1.5 mt-3">
          {stats.map((s) => (
            <div key={s.k} className="flex-1 min-w-0 rounded-xl2 bg-cream px-2.5 py-2">
              <p className="font-mono text-[17px] sm:text-[15px] font-semibold tabular-nums leading-none truncate">
                {s.value}
              </p>
              <p className="text-[10px] uppercase tracking-[0.06em] text-ink-soft mt-1.5 truncate">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* EU transparency: reach inside the EU + where it runs. Only shows once
          sync-geo has written eu_reach / countries, so competitor rows with no
          geo data render exactly as before. */}
      {(euR || geoCodes.length > 0) && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium mt-2.5 text-ink-soft min-w-0">
          {euR && (
            <span className="flex-shrink-0">
              <span className="font-mono font-semibold text-ink tabular-nums">{euR}</span> EU reach
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
        <p className="font-mono text-[11px] text-ink-soft mt-2 tabular-nums break-words">{metricBits.join('  ·  ')}</p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-cream text-ink-soft max-w-full truncate">
              {t}
            </span>
          ))}
        </div>
      )}

    </div>
  );

  // Kept out of the card link on purpose: an anchor cannot legally nest inside
  // another anchor, so the footer sits beside the Link rather than inside it.
  const footer = (permalink || ad.added_by_email) && (
    <div className="mx-4 sm:mx-3.5 mb-1 flex items-center justify-between gap-2 border-t border-line min-w-0">
      {/* Opens the exact ad, never the advertiser page. Rendered only when a
          real permalink exists on the row. */}
      {permalink ? (
        <a
          href={permalink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="press-solo -ml-1 inline-flex items-center gap-1.5 min-h-[44px] px-1 text-[13px] font-semibold text-coral-dark"
        >
          <span className="press-solo-face inline-flex items-center gap-1.5">
            Open ad <ArrowSquareOut size={14} weight="bold" className="flex-shrink-0" />
          </span>
        </a>
      ) : (
        <span />
      )}
      {ad.added_by_email && (
        <span className="text-[11px] text-ink-soft truncate">by {displayName(ad.added_by_email)}</span>
      )}
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
    'press group relative block bg-card rounded-xl3 border shadow-card hover:shadow-cardhover overflow-hidden';

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
        {content}
        {footer}
      </div>
    );
  }

  return (
    <div className={`${shell} border-line`}>
      <Link to={`/ad/${ad.id}`} className="block">
        {content}
      </Link>
      {footer}
    </div>
  );
}
