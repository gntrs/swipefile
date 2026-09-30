import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowSquareOut, Check, Copy, X } from '@phosphor-icons/react';
import { fetchAll } from '@/lib/db';
import PartialNotice from '@/components/PartialNotice';
import { isOwnBrand } from '@/lib/brand';
import { ANGLE_IDS, angleLabel } from '@/lib/angles';
import { hookText, hookAngle, angleCounts } from '@/lib/library/hooks';
import { shouldIgnoreKey } from '@/lib/library/keys';
import SelectBox from '@/features/save/SelectBox';
import { RowsSkeleton } from '@/components/Skeleton';
import BriefFromSelection, { MAX_BRIEF_ADS, MAX_BRIEF_HOOKS } from '@/features/ai/BriefFromSelection';
import ClassifyHooksButton from '@/features/ai/ClassifyHooksButton';
import {
  Page,
  PageHeader,
  Panel,
  List,
  Badge,
  Meta,
  Button,
  IconButton,
  Segmented,
  Chip,
  Toolbar,
  SearchField,
  FilterPanel,
  FilterGroup,
  ActiveFilters,
  EmptyState,
  useMedia,
} from '@/components/ui';

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

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={copied ? 'Copied' : 'Copy hook'}
      icon={copied ? Check : Copy}
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={copied ? '!text-emerald-300' : ''}
    />
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Under 1280 the toolbar has little room (one row from 1024, a sideways
  // scrolling row on a phone that would push Filters off screen), so the
  // Everything, Proven, Live now choice moves into Filters there.
  const roomy = useMedia('(min-width: 1280px)');
  const showInPanel = !roomy;
  const wide = useMedia('(min-width: 640px)');
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

  // Angle and tag live behind Filters; each one that is on shows as a chip.
  const active = [
    showInPanel && only !== 'all' && {
      key: 'only',
      label: ONLY.find((o) => o.id === only)?.label,
      onRemove: () => setOnly('all'),
    },
    angle !== 'all' && {
      key: 'angle',
      label: angle === 'none' ? 'No angle yet' : `Angle: ${angleLabel(angle)}`,
      onRemove: () => setAngle('all'),
    },
    tag && { key: 'tag', label: `Tag: ${tag}`, onRemove: () => setTag(null) },
  ].filter(Boolean);
  const clearFilters = () => {
    if (showInPanel) setOnly('all');
    setAngle('all');
    setTag(null);
  };
  const hasAngles = angleChips.angles.length > 0 || angle !== 'all';
  const hasTags = topTags.length > 0 || Boolean(tag);
  const anyFilter = active.length > 0 || who !== 'all' || only !== 'all' || q.trim();

  return (
    <Page id="hooks">
      <PageHeader
        title="Hook bank"
        context={`${hooks.length} hooks to steal from. Proven ones float to the top.`}
        actions={<ClassifyHooksButton onDone={reloadHooks} />}
      />
      <PartialNotice rows={partial} noun="ads" onRetry={() => setReload((n) => n + 1)} className="mb-4" />

      <Toolbar
        search={
          <SearchField
            ref={searchRef}
            value={q}
            onChange={setQ}
            placeholder="Search hooks, brands, tags..."
            label="Search hooks"
          />
        }
      >
        <Segmented label="Whose hooks" options={WHO} value={who} onChange={setWho} className="flex-shrink-0" />
        {!showInPanel && <Segmented label="Show" options={ONLY} value={only} onChange={setOnly} className="flex-shrink-0" />}
        {(hasAngles || hasTags || showInPanel) && (
          <FilterPanel count={active.length} open={filtersOpen} onOpenChange={setFiltersOpen} onClear={clearFilters}>
            {showInPanel && (
              <FilterGroup label="Show">
                <Segmented label="Show" options={ONLY} value={only} onChange={setOnly} />
              </FilterGroup>
            )}
            {hasAngles && (
              <FilterGroup label="Angle">
                <Chip pressed={angle === 'none'} count={angleChips.none} onClick={() => setAngle(angle === 'none' ? 'all' : 'none')}>
                  No angle yet
                </Chip>
                {angleChips.angles.map((a) => (
                  <Chip key={a.id} pressed={angle === a.id} count={a.count} onClick={() => setAngle(angle === a.id ? 'all' : a.id)}>
                    {angleLabel(a.id)}
                  </Chip>
                ))}
              </FilterGroup>
            )}
            {hasTags && (
              <FilterGroup label="Tag">
                {(topTags.includes(tag) || !tag ? topTags : [tag, ...topTags]).map((t) => (
                  <Chip key={t} pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    {t}
                  </Chip>
                ))}
              </FilterGroup>
            )}
          </FilterPanel>
        )}
      </Toolbar>
      <ActiveFilters items={active} onClearAll={clearFilters} />

      {loading ? (
        <RowsSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState
            title="No hooks match."
            text="Hooks come from the ads in the library."
            action={
              anyFilter ? (
                <Button
                  onClick={() => {
                    clearFilters();
                    setWho('all');
                    setOnly('all');
                    setQ('');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button to="/ads/add">Add an ad</Button>
              )
            }
          />
        </Panel>
      ) : (
        <Panel flush>
          <List>
            {filtered.map((h) => {
              const on = picked.has(h.key);
              return (
                <li key={h.key} className={on ? 'bg-white/[0.04]' : ''}>
                  <div className="flex items-start gap-2 lg:gap-3 min-h-[56px] py-1.5 pl-2 pr-3 lg:pl-3 lg:pr-4">
                    <SelectBox checked={on} onChange={() => togglePick(h.key)} label={`Select hook: ${h.text.slice(0, 60)}`} />
                    <div className="flex-1 min-w-0 py-2">
                      <p className="text-body font-medium text-ink break-words">{h.text}</p>
                      <Meta
                        as="p"
                        className="text-small text-ink-soft mt-1"
                        items={[
                          h.proven && <Badge tone="good">Proven</Badge>,
                          h.live && (
                            <span className="inline-flex items-center gap-1.5 text-emerald-300">
                              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {h.days > 0 ? `Live ${h.days}d` : 'Live'}
                            </span>
                          ),
                          h.angle && angleLabel(h.angle),
                          ...h.brands.slice(0, 2).map((b) => <span className={isOwnBrand(b) ? 'text-ink whitespace-nowrap' : 'whitespace-nowrap'}>{b}</span>),
                          h.ads.length > 1 && `seen in ${h.ads.length} ads`,
                        ]}
                      />
                    </div>
                    <div className="flex flex-shrink-0 items-center">
                      <CopyButton text={h.text} />
                      <IconButton to={`/ad/${h.best.id}`} label="Open the ad" icon={ArrowSquareOut} />
                    </div>
                  </div>
                </li>
              );
            })}
          </List>
        </Panel>
      )}

      {picked.size > 0 && (
        <>
          {/* Room under the last row so the bar never covers it. */}
          <div aria-hidden="true" className="h-28" />
          <div className="fixed bottom-[var(--tabbar-h)] left-[var(--nav-left)] right-0 z-40 pointer-events-none">
            <div className="mx-auto w-full max-w-[var(--maxw)] px-2 sm:px-[var(--gutter)] pb-2 sm:pb-3 lg:pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="pointer-events-auto bg-card border border-line rounded-xl3 shadow-cardhover p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-ui font-medium text-ink px-1 sm:px-2 min-h-[44px] flex items-center gap-1">
                    <span className="num">{picked.size}</span>
                    <span className="max-[359px]:sr-only">selected</span>
                  </p>
                  <BriefFromSelection hooks={briefHooks} adIds={briefAdIds} label={wide ? 'Brief from these hooks' : 'Brief from these'} className="ml-auto" />
                  <Button onClick={() => setPicked(new Set())} aria-label="Clear selection" icon={X} className="max-sm:px-0 max-sm:w-11">
                    <span className="hidden sm:inline">Clear</span>
                  </Button>
                </div>
                {capped && (
                  <p aria-live="polite" className="px-2 pt-1 pb-1 text-small text-ink-soft">
                    A brief takes the first {MAX_BRIEF_HOOKS} hooks and {MAX_BRIEF_ADS} ads.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
