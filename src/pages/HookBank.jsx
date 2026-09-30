import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowSquareOut, Check, Copy, MagnifyingGlass, Quotes, X } from '@phosphor-icons/react';
import { fetchAll } from '@/lib/db';
import PartialNotice from '@/components/PartialNotice';
import { isOwnBrand } from '@/lib/brand';
import { ANGLE_IDS, angleLabel } from '@/lib/angles';
import { hookText, hookAngle, angleCounts } from '@/lib/library/hooks';
import { shouldIgnoreKey } from '@/lib/library/keys';
import SelectBox from '@/features/save/SelectBox';
import { RowsSkeleton } from '@/components/Skeleton';
import BriefFromSelection from '@/features/ai/BriefFromSelection';
import ClassifyHooksButton from '@/features/ai/ClassifyHooksButton';

const WHO = [
  { id: 'all', label: 'All' },
  { id: 'ours', label: 'Ours' },
  { id: 'rivals', label: 'Rivals' },
];

const ONLY = [
  { id: 'all', label: 'Everything' },
  { id: 'proven', label: 'Proven' },
  { id: 'live', label: 'Live now' },
];

const isOurs = (a) => isOwnBrand(a.brand);
// A hook is proven when a human marked the ad a winner, or the brand kept
// paying to run it for 30+ days (the auto-verdict threshold).
const isProven = (a) => a.verdict === 'winner' || (a.metrics?.days_running ?? 0) >= 30;

// A brief takes at most this many hooks and source ads.
const MAX_BRIEF_HOOKS = 50;
const MAX_BRIEF_ADS = 20;

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      aria-label="Copy hook"
      className={`press w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
        copied ? 'bg-emerald-500/15 text-emerald-300' : 'text-ink-soft hover:text-ink hover:bg-white/[0.06]'
      }`}
    >
      {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
    </button>
  );
}

// Every hook we know, ours and the competition's, ready to steal from when
// writing new ads. Duplicates collapse into one card; proven hooks float up.
export default function HookBank() {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [only, setOnly] = useState('all');
  const [tag, setTag] = useState(null);
  const [angle, setAngle] = useState('all'); // 'all' | 'none' | angle id
  const [picked, setPicked] = useState(() => new Set()); // hook keys
  const searchRef = useRef(null);

  const [partial, setPartial] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchAll((q) => q.order('created_at', { ascending: false }), 'ads').then((data) => {
      if (!mounted) return;
      setPartial(data.error ? data : null);
      setAds(data.filter((a) => hookText(a)));
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [reload]);
  const reloadHooks = useCallback(() => setReload((n) => n + 1), []);

  // "/" jumps to the search box, like the library.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.shiftKey || shouldIgnoreKey(e)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Collapse identical hook text into one card carrying its best ad.
  const hooks = useMemo(() => {
    const map = new Map();
    for (const a of ads) {
      const text = hookText(a);
      const key = text.toLowerCase();
      if (!map.has(key)) map.set(key, { text, ads: [] });
      map.get(key).ads.push(a);
    }
    return [...map.values()].map((h) => {
      const best =
        h.ads.find((a) => a.verdict === 'winner') ||
        [...h.ads].sort(
          (a, b) => (b.metrics?.days_running ?? -1) - (a.metrics?.days_running ?? -1)
        )[0];
      return {
        ...h,
        best,
        brands: [...new Set(h.ads.map((a) => (a.brand || '').trim()).filter(Boolean))],
        tags: [...new Set(h.ads.flatMap((a) => a.tags || []))],
        drivers: [...new Set(h.ads.flatMap((a) => a.metrics?.emotional_drivers || []))],
        proven: h.ads.some(isProven),
        live: h.ads.some((a) => a.metrics?.live),
        days: Math.max(...h.ads.map((a) => a.metrics?.days_running ?? 0)),
        ours: h.ads.some(isOurs),
        rivals: h.ads.some((a) => !isOurs(a)),
      };
    }).map((h) => ({ ...h, key: h.text.toLowerCase(), angle: hookAngle(h) }));
  }, [ads]);

  const angleChips = useMemo(() => angleCounts(hooks, ANGLE_IDS), [hooks]);

  const topTags = useMemo(() => {
    const counts = new Map();
    for (const h of hooks) for (const t of h.tags) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
  }, [hooks]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return hooks
      .filter((h) => {
        if (who === 'ours' && !h.ours) return false;
        if (who === 'rivals' && !h.rivals) return false;
        if (only === 'proven' && !h.proven) return false;
        if (only === 'live' && !h.live) return false;
        if (tag && !h.tags.includes(tag)) return false;
        if (angle === 'none' && h.angle) return false;
        if (angle !== 'all' && angle !== 'none' && h.angle !== angle) return false;
        if (!term) return true;
        return [h.text, ...h.brands, ...h.tags, ...h.drivers]
          .join(' ')
          .toLowerCase()
          .includes(term);
      })
      .sort(
        (a, b) =>
          Number(b.proven) - Number(a.proven) ||
          b.days - a.days ||
          new Date(b.best.created_at) - new Date(a.best.created_at)
      );
  }, [hooks, q, who, only, tag, angle]);

  // Selection for a brief: hook text plus the best ad behind each hook.
  const selectedHooks = useMemo(() => hooks.filter((h) => picked.has(h.key)), [hooks, picked]);
  const briefHooks = selectedHooks.slice(0, MAX_BRIEF_HOOKS).map((h) => h.text);
  const briefAdIds = [...new Set(selectedHooks.map((h) => h.best?.id).filter(Boolean))].slice(0, MAX_BRIEF_ADS);
  const capped = selectedHooks.length > MAX_BRIEF_HOOKS || new Set(selectedHooks.map((h) => h.best?.id)).size > MAX_BRIEF_ADS;
  const togglePick = (key) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const chip = (active) =>
    `press flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3.5 rounded-xl text-[14px] font-medium transition-colors ${
      active ? 'bg-accent text-black' : 'bg-white/[0.06] text-ink-soft hover:text-ink'
    }`;

  return (
    <div data-page="hooks" className={`px-5 sm:px-8 pt-6 sm:pt-8 pb-10 max-w-[860px] mx-auto ${picked.size ? 'pb-48' : ''}`}>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-[1.1]">Hook bank</h1>
          <p className="text-ink-soft text-[15px] leading-relaxed mt-2">
            {hooks.length} hooks to steal from. Proven ones float to the top.
          </p>
        </div>
        <ClassifyHooksButton onDone={reloadHooks} />
      </div>
      <PartialNotice rows={partial} noun="ads" onRetry={() => setReload((n) => n + 1)} className="mb-4" />

      {/* Controls */}
      <div className="flex flex-col gap-2 mb-6">
        <div className="flex items-center gap-2 bg-card border border-line rounded-xl px-3 focus-within:border-ink-soft transition-colors">
          <MagnifyingGlass size={18} className="text-ink-soft flex-shrink-0" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search hooks, brands, tags..."
            aria-label="Search hooks"
            className="w-full min-w-0 min-h-[44px] py-2.5 bg-transparent focus:outline-none focus-visible:shadow-none text-[16px] sm:text-[15px] placeholder:text-ink-soft"
          />
        </div>
        <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap">
          {WHO.map((w) => (
            <button
              key={w.id}
              onClick={() => setWho(w.id)}
              className={chip(who === w.id)}
            >
              {w.label}
            </button>
          ))}
          <span className="w-px bg-line flex-shrink-0 mx-1.5 my-2.5" />
          {ONLY.map((o) => (
            <button
              key={o.id}
              onClick={() => setOnly(o.id)}
              className={chip(only === o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {(angleChips.angles.length > 0 || angle !== 'all') && (
          <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap" role="group" aria-label="Filter by angle">
            <button type="button" onClick={() => setAngle('all')} aria-pressed={angle === 'all'} className={chip(angle === 'all')}>
              All angles
            </button>
            <button type="button" onClick={() => setAngle('none')} aria-pressed={angle === 'none'} className={chip(angle === 'none')}>
              No angle yet <span className="font-mono text-[12px] tabular-nums opacity-60">{angleChips.none}</span>
            </button>
            {angleChips.angles.map((a) => (
              <button key={a.id} type="button" onClick={() => setAngle(a.id)} aria-pressed={angle === a.id} className={chip(angle === a.id)}>
                {angleLabel(a.id)} <span className="font-mono text-[12px] tabular-nums opacity-60">{a.count}</span>
              </button>
            ))}
          </div>
        )}
        {topTags.length > 0 && (
          <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap">
            {topTags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                className={`press flex-shrink-0 min-h-[44px] min-w-[44px] px-3 rounded-xl text-[13px] transition-colors ${
                  tag === t ? 'bg-accent text-black' : 'text-ink-soft hover:text-ink hover:bg-white/[0.06]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <RowsSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-ink-soft">
          <Quotes size={32} weight="bold" className="mx-auto mb-4" />
          <p className="text-[16px]">No hooks match. Hooks come from the ads in the library.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((h) => (
            <div
              key={h.key}
              className={`bg-card rounded-xl3 shadow-card pl-1 pr-3 py-3 flex items-start gap-2 transition-colors ${
                picked.has(h.key) ? 'ring-2 ring-accent bg-card-hi' : ''
              }`}
            >
              <SelectBox checked={picked.has(h.key)} onChange={() => togglePick(h.key)} label={`Select hook: ${h.text.slice(0, 60)}`} />
              <div className="flex-1 min-w-0 pt-2">
                <p className="text-[16px] leading-snug font-medium break-words">{h.text}</p>
                <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap mt-2.5">
                  {h.proven && (
                    <span className="font-mono text-[11px] font-medium uppercase leading-none tracking-[0.08em] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300">
                      proven
                    </span>
                  )}
                  {h.live && (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      live{h.days > 0 && ` · ${h.days}d`}
                    </span>
                  )}
                  {h.angle && (
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft">{angleLabel(h.angle)}</span>
                  )}
                  {h.brands.slice(0, 2).map((b) => (
                    <span
                      key={b}
                      className={`text-[13px] font-medium ${isOwnBrand(b) ? 'text-ink' : 'text-ink-soft'}`}
                    >
                      {b}
                    </span>
                  ))}
                  {h.ads.length > 1 && (
                    <span className="font-mono text-[11px] text-ink-soft">seen in {h.ads.length} ads</span>
                  )}
                  {h.drivers.slice(0, 3).map((d) => (
                    <span
                      key={d}
                      className="text-[12px] leading-5 px-1.5 rounded bg-white/[0.06] text-ink-soft"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-shrink-0 pt-0.5">
                <CopyButton text={h.text} />
                <Link
                  to={`/ad/${h.best.id}`}
                  aria-label="Open the ad"
                  className="press w-11 h-11 rounded-xl flex items-center justify-center text-ink-soft hover:text-ink hover:bg-white/[0.06] transition-colors"
                >
                  <ArrowSquareOut size={16} weight="bold" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-0 sm:left-60 z-40 px-3 sm:px-6 pb-2 sm:pb-[calc(1rem+env(safe-area-inset-bottom))] pointer-events-none">
          <div className="pointer-events-auto max-w-[860px] mx-auto bg-card border border-line rounded-xl3 shadow-cardhover p-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[13px] tabular-nums text-ink px-2 min-h-[44px] flex items-center">{picked.size} selected</p>
              <BriefFromSelection hooks={briefHooks} adIds={briefAdIds} label="Brief from these hooks" className="ml-auto" />
              <button
                type="button"
                onClick={() => setPicked(new Set())}
                aria-label="Clear selection"
                className="press inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[14px] font-semibold text-ink transition-colors"
              >
                <X size={16} weight="bold" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            </div>
            {capped && (
              <p aria-live="polite" className="px-2 pt-1 pb-1 text-[14px] text-ink-soft">
                A brief takes the first {MAX_BRIEF_HOOKS} hooks and {MAX_BRIEF_ADS} ads.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
