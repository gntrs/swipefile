import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Check, ArrowSquareOut } from '@phosphor-icons/react';
import { useTeam } from '@/contexts/TeamContext';
import { Badge, Meta, Metrics } from '@/components/ui';
import { TEAM_MODE } from '@/lib/modules';
import { angleOf, angleLabel } from '@/lib/angles';
import { setStarred, isStarred, isRecent, fmtReach, fmtEuReach, adCountries, countryName } from '@/lib/ads';

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

const pos = (v) => Number.isFinite(+v) && +v > 0;

// The three numbers a card shows, always three columns so a row of cards
// lines up. Our own ads with performance show what we paid and got; ads with
// reach data show how many saw it, how hard it is pushed, how long it lived.
// An ad with neither shows no numbers.
function cardNumbers(m, days) {
  if (pos(m.ctr) || pos(m.cpc) || pos(m.spend)) {
    return [
      { key: 'ctr', label: 'CTR', value: pos(m.ctr) ? `${(+m.ctr).toFixed(1)}%` : null },
      { key: 'cpc', label: 'CPC', value: pos(m.cpc) ? `€${(+m.cpc).toFixed(2)}` : null },
      { key: 'spend', label: 'Spend', value: pos(m.spend) ? `€${fmtNum(m.spend)}` : null },
    ];
  }
  const reach = fmtReach({ metrics: m });
  const perDay = fmtNum(m.reach_per_day);
  if (!reach && !perDay && days === null) return null;
  return [
    { key: 'reach', label: 'Reach', value: reach || null },
    { key: 'perday', label: 'Per day', value: perDay },
    { key: 'days', label: 'Days live', value: days === null ? null : String(days) },
  ];
}

// AdCard is text-first on purpose: no creative thumbnail. One fixed shape, so
// the numbers and the footer sit at the same height across a row of cards:
// brand, hook, a status line, three numbers, then a footer with the link out.
// Supports an optional selection mode (for bulk actions and Compare): when
// `selectable` is set the whole card toggles selection instead of navigating.
// `focused` draws the keyboard ring; `onAdChange` hears about a star toggled
// on the card, so a list can keep its copy of the row in step.
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
  const days = Number.isFinite(+m.days_running) && m.days_running !== null && m.days_running !== '' ? +m.days_running : null;
  const numbers = cardNumbers(m, days);
  const showsDays = numbers?.some((n) => n.key === 'days');
  const euR = fmtEuReach(ad);
  const geoCodes = adCountries(ad);
  const permalink = adPermalink(ad);
  const angle = angleOf(ad);
  const byName = TEAM_MODE && ad.added_by_email ? displayName(ad.added_by_email) : null;

  const star = (
    <button
      type="button"
      onClick={toggleStar}
      aria-label={starred ? 'Remove star' : 'Star this ad'}
      aria-pressed={starred}
      className="press-solo relative flex-shrink-0 w-11 h-11 -mr-3 -mt-2.5 flex items-center justify-center rounded-full"
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

  // Running or stopped, with how long when the numbers do not already say it.
  const life = days !== null && (
    <span className={m.live ? 'text-emerald-300' : 'text-ink-soft'}>
      <span aria-hidden="true" className={`inline-block align-middle w-1.5 h-1.5 mr-1.5 -mt-0.5 rounded-full ${m.live ? 'bg-emerald-400' : 'bg-ink-soft/50'}`} />
      {m.live ? 'Running' : 'Stopped'}
      {!showsDays && ` ${days}d`}
    </span>
  );

  const content = (
    <div className={`flex-1 flex flex-col px-5 pt-4 pb-5 ${selectable ? 'pl-12' : ''}`}>
      {/* who it is, and the one control that matters */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 min-h-[24px]">
          <p className="text-small font-semibold text-ink-soft truncate">{ad.brand || 'Untitled'}</p>
          {isRecent(ad) && <Badge className="flex-shrink-0">New</Badge>}
        </div>
        {star}
      </div>

      {/* what it says: the hook is the thing you came to read */}
      <p
        className={`text-body font-medium leading-snug min-h-[2.75em] mt-0.5 break-words line-clamp-2 ${
          ad.hook ? 'text-ink' : 'text-ink-soft'
        }`}
      >
        {ad.hook || 'No hook noted'}
      </p>

      {/* the glance verdict: what we called it, is it alive, which angle */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mt-3 text-small min-w-0">
        <Badge tone={v.tone}>{v.label}</Badge>
        <Meta items={[life, angle && <span className="text-ink-soft">{angleLabel(angle)}</span>]} className="min-w-0 truncate" />
      </div>

      {/* the numbers sit at the foot of the card, so a row of cards lines up */}
      {numbers && <Metrics items={numbers} cols={3} className="mt-auto pt-5" />}
    </div>
  );

  // Kept out of the card link on purpose: an anchor cannot legally nest inside
  // another anchor, so the footer sits beside the Link rather than inside it.
  // Always rendered, so every card in a row ends at the same line.
  const where = geoCodes.length > 0 && (
    <span title={geoCodes.map(countryName).join(', ')}>
      {geoCodes.slice(0, 3).join(' ')}
      {geoCodes.length > 3 && ` +${geoCodes.length - 3}`}
    </span>
  );
  const footer = (
    <div className="mx-5 flex items-center justify-between gap-3 min-h-[44px] border-t border-line min-w-0">
      {/* Opens the exact ad, never the advertiser page. Rendered only when a
          real permalink exists on the row. */}
      {permalink ? (
        <a
          href={permalink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="press-solo -ml-1 flex-shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-1 text-small font-semibold text-ink-soft hover:text-ink"
        >
          <span className="press-solo-face inline-flex items-center gap-1.5">
            Open ad <ArrowSquareOut size={14} weight="bold" className="flex-shrink-0" />
          </span>
        </a>
      ) : (
        <span />
      )}
      <Meta
        items={[ad.platform, euR && `${euR} EU reach`, where, byName && `by ${byName}`]}
        className="min-w-0 truncate text-small text-ink-soft text-right"
      />
    </div>
  );

  const selectMark = selectable && (
    <span
      aria-hidden="true"
      className={`absolute top-4 left-4 z-10 w-6 h-6 rounded-full flex items-center justify-center border-2 ${
        selected ? 'bg-accent border-accent text-black' : 'border-ink-soft/50 text-transparent'
      }`}
    >
      <Check size={14} weight="bold" />
    </span>
  );

  const shell = `press group relative flex flex-col bg-card rounded-xl3 hover:bg-card-hi transition-colors overflow-hidden ${
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
