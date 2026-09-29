import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  PlusCircle,
  MagnifyingGlass,
  Tray,
  Star,
  Trophy,
  CheckSquare,
  ClockCounterClockwise,
  DownloadSimple,
  Keyboard,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';
import { db, IS_DEMO } from '@/lib/db';
import { GEO_STATUS, VERDICTS, FOCUS_COUNTRIES, countryName, humanVerdictPatch } from '@/lib/ads';
import { ANGLE_IDS, angleLabel } from '@/lib/angles';
import { SORTS, filtersFromParams, paramsFromFilters, isFiltered, clearFilters, withFilter } from '@/lib/library/filters';
import { loadPage, loadFacets, invalidateLocalCache, computeFacets, PAGE_SIZE, LOCAL_HINT_THRESHOLD } from '@/lib/library/query';
import { saveListContext } from '@/lib/library/listContext';
import { MAX_SELECT } from '@/lib/library/bulk';
import AdCard from '@/components/AdCard';
import { Skeleton } from '@/components/Skeleton';
import BulkBar from '@/features/save/BulkBar';
import KeyHelp from '@/features/save/KeyHelp';
import useLibraryKeys from '@/features/save/useLibraryKeys';

const WHO = [
  { id: 'all', label: 'All' },
  { id: 'ours', label: 'Ours' },
  { id: 'rivals', label: 'Rivals' },
];

const EMPTY_FACETS = computeFacets([]);
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// Every chip in the filter rows is a thumb target first and a label second:
// 44px tall minimum, never smaller, on every viewport.
const pill = (active) =>
  `press flex-shrink-0 flex items-center gap-1.5 min-h-[44px] min-w-[44px] justify-center px-3.5 rounded-2xl text-[13px] font-semibold transition-colors ${
    active ? 'bg-accent text-black' : 'bg-card border border-line text-ink-soft'
  }`;
const selectCls = (active) =>
  `flex-shrink-0 min-h-[44px] px-3 rounded-2xl text-[13px] font-semibold focus:outline-none ${
    active ? 'bg-accent text-black' : 'bg-card border border-line text-ink-soft focus:border-accent'
  }`;
const headerBtn = (active) =>
  `press flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-3 sm:px-3.5 rounded-2xl font-semibold transition-colors ${
    active ? 'bg-ink text-black' : 'bg-card border border-line text-ink-soft'
  }`;

// The ad library. Filters, sort and page live in the URL, so a view survives a
// reload and can be linked to (/ads?starred=1, /ads?q=Brand, /ads?who=rivals).
// The database does the searching and paging when db-setup.sql has the
// library search functions; otherwise the same rules run in the browser.
export default function Library() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const key = paramsFromFilters(filters).toString();
  const selectionKey = paramsFromFilters({ ...filters, page: 1 }).toString();

  // The ref moves at once, so two quick changes in a row both land even
  // before the page renders the first.
  const setFilters = useCallback(
    (next) => {
      const params = paramsFromFilters(next);
      filtersRef.current = filtersFromParams(params);
      setParams(params, { replace: true });
    },
    [setParams]
  );
  const change = (k, v) => setFilters(withFilter(filtersRef.current, k, v));

  // ---- search box: its own text, written to the URL after 250 ms ---------
  const [search, setSearch] = useState(filters.q);
  const written = useRef(filters.q);
  const searchRef = useRef(null);
  useEffect(() => {
    // Only a change from outside (Clear filters, a link) resets the box.
    if (filters.q !== written.current) {
      written.current = filters.q;
      setSearch(filters.q);
    }
  }, [filters.q]);
  useEffect(() => {
    if (search === filtersRef.current.q) return undefined;
    const t = setTimeout(() => {
      written.current = search;
      setFilters(withFilter(filtersRef.current, 'q', search));
    }, 250);
    return () => clearTimeout(t);
  }, [search, setFilters]);

  // ---- data ---------------------------------------------------------------
  // Other pages (the ad page, Compare) write without telling the local copy,
  // so every visit starts from a fresh one. Within the visit it is reused.
  useState(() => invalidateLocalCache());
  const [result, setResult] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [facetsKey, setFacetsKey] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setLoading(true);
    loadPage(filtersRef.current).then((r) => {
      if (id !== request.current) return; // a newer request won
      setResult(r);
      setRows(r.rows);
      setLoading(false);
      if (!r.error && r.page !== filtersRef.current.page) setFilters({ ...filtersRef.current, page: r.page });
    });
  }, [key, reloadKey, setFilters]);

  useEffect(() => {
    let live = true;
    loadFacets().then((r) => {
      if (live) setFacets(r.facets || EMPTY_FACETS);
    });
    return () => {
      live = false;
    };
  }, [facetsKey]);

  // The ad page walks this list with J and K.
  useEffect(() => {
    if (!loading) saveListContext({ ids: rows.map((a) => a.id), search: location.search });
  }, [rows, loading, location.search]);

  const reloadAll = useCallback(() => {
    invalidateLocalCache();
    setReloadKey((n) => n + 1);
    setFacetsKey((n) => n + 1);
  }, []);

  // Anything saved anywhere (Add, import, capture) shows up here.
  useEffect(() => {
    window.addEventListener('sf:ads-saved', reloadAll);
    return () => window.removeEventListener('sf:ads-saved', reloadAll);
  }, [reloadAll]);

  // ---- selection ----------------------------------------------------------
  const [selectMode, setSelectMode] = useState(false);
  const [selection, setSelection] = useState(() => new Map());
  const [full, setFull] = useState(false);
  const firstKey = useRef(selectionKey);
  useEffect(() => {
    // New filters, new list: the selection goes. Paging keeps it.
    if (firstKey.current === selectionKey) return;
    firstKey.current = selectionKey;
    setSelection(new Map());
    setFull(false);
  }, [selectionKey]);

  const toggleSelect = useCallback((ad) => {
    setSelection((cur) => {
      const next = new Map(cur);
      if (next.has(ad.id)) next.delete(ad.id);
      else if (next.size < MAX_SELECT) next.set(ad.id, ad);
      setFull(next.size >= MAX_SELECT);
      return next;
    });
  }, []);

  const selectPage = () => {
    setSelection((cur) => {
      const next = new Map(cur);
      for (const a of rows) {
        if (next.size >= MAX_SELECT) break;
        next.set(a.id, a);
      }
      setFull(next.size >= MAX_SELECT);
      return next;
    });
  };

  const clearSelection = () => {
    setSelection(new Map());
    setFull(false);
  };

  // Rows changed by a bulk action or a key: update the page and the selection.
  const applyRows = useCallback((changed) => {
    const byId = new Map(changed.map((a) => [a.id, a]));
    setRows((cur) => cur.map((a) => (byId.has(a.id) ? { ...a, ...byId.get(a.id) } : a)));
    setSelection((cur) => {
      if (![...byId.keys()].some((id) => cur.has(id))) return cur;
      const next = new Map(cur);
      for (const [id, a] of byId) if (next.has(id)) next.set(id, { ...next.get(id), ...a });
      return next;
    });
  }, []);

  const onDeleted = (ids) => {
    setSelection((cur) => {
      const next = new Map(cur);
      for (const id of ids) next.delete(id);
      return next;
    });
    setReloadKey((n) => n + 1);
  };

  // ---- keyboard -----------------------------------------------------------
  const [focusIndex, setFocusIndex] = useState(-1);
  const [announce, setAnnounce] = useState('');
  const [help, setHelp] = useState(false);
  useEffect(() => setFocusIndex(-1), [key, reloadKey]);

  const focusedAd = focusIndex >= 0 ? rows[focusIndex] : null;

  const moveFocus = (delta) => {
    if (!rows.length) return;
    const next = focusIndex < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, focusIndex + delta));
    setFocusIndex(next);
    const id = rows[next]?.id;
    requestAnimationFrame(() => document.querySelector(`[data-ad-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }));
  };

  const patchAd = async (ad, patch, okText) => {
    applyRows([{ ...ad, ...patch }]);
    const { error } = await db.from('ads').update(patch).eq('id', ad.id);
    if (error) {
      applyRows([ad]);
      setAnnounce(`Could not save: ${error.message}`);
      return;
    }
    invalidateLocalCache();
    setFacetsKey((n) => n + 1);
    setAnnounce(okText);
  };

  useLibraryKeys((action) => {
    if (action === 'search') searchRef.current?.focus();
    else if (action === 'new') navigate('/ads/add');
    else if (action === 'next') moveFocus(1);
    else if (action === 'prev') moveFocus(-1);
    else if (action === 'help') setHelp(true);
    else if (action === 'escape') {
      if (selection.size) clearSelection();
      else if (selectMode) setSelectMode(false);
      else if (focusIndex >= 0) setFocusIndex(-1);
      else return false;
    } else if (!focusedAd) return false;
    else if (action === 'open') navigate(`/ad/${focusedAd.id}`);
    else if (action === 'select') {
      setSelectMode(true);
      toggleSelect(focusedAd);
    } else if (action === 'winner' || action === 'loser') {
      patchAd(focusedAd, humanVerdictPatch(focusedAd, action), `Marked ${action}.`);
    } else if (action === 'star') {
      const starred = focusedAd.metrics?.starred !== true;
      patchAd(focusedAd, { metrics: { ...(focusedAd.metrics || {}), starred } }, starred ? 'Starred.' : 'Star removed.');
    }
    return undefined;
  });

  // ---- view ---------------------------------------------------------------
  const goPage = (n) => {
    setFilters(withFilter(filtersRef.current, 'page', n));
    document.querySelector('main')?.scrollTo({ top: 0 });
  };

  const filtered = isFiltered(filters);
  const countries = useMemo(() => {
    const list = [...(facets.countries || [])];
    const focus = FOCUS_COUNTRIES.filter((c) => list.some((x) => x.code === c));
    const rest = list.filter((x) => !FOCUS_COUNTRIES.includes(x.code));
    const ordered = [...focus.map((c) => list.find((x) => x.code === c)), ...rest];
    if (filters.country !== 'all' && !ordered.some((x) => x.code === filters.country)) ordered.unshift({ code: filters.country, count: 0 });
    return ordered;
  }, [facets.countries, filters.country]);
  const angles = useMemo(() => (facets.angles || []).filter((a) => ANGLE_IDS.includes(a.angle)), [facets.angles]);
  const tags = useMemo(() => {
    const list = [...(facets.tags || [])];
    if (filters.tag && !list.some((t) => t.tag === filters.tag)) list.unshift({ tag: filters.tag, count: 0 });
    return list;
  }, [facets.tags, filters.tag]);

  const total = result?.total ?? 0;
  const page = result?.page ?? filters.page;
  const pages = result?.pages ?? 1;
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = total ? Math.min(total, from + rows.length - 1) : 0;
  const firstRun = !loading && !result?.error && facets.total === 0 && total === 0 && !filtered;
  const showLocalHint = result?.mode === 'local' && !IS_DEMO && (result?.scanned ?? facets.total) > LOCAL_HINT_THRESHOLD;
  const selected = [...selection.values()];

  return (
    <div data-page="library" className={`px-5 sm:px-8 py-6 max-w-[1200px] mx-auto ${selectMode || selection.size ? 'pb-72 sm:pb-48' : 'pb-24'}`}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-[26px] sm:text-[22px] font-semibold tracking-[-0.02em] leading-tight">
            {filters.starred ? 'Starred ads' : 'Ad library'}
          </h1>
          <p className="font-mono text-ink-soft text-[12px] sm:text-[13px] tabular-nums mt-0.5">
            {filters.starred
              ? `${fmt(facets.starred)} starred`
              : `${fmt(facets.total)} saved · ${fmt(facets.proven)} proven · ${fmt(facets.starred)} starred`}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => (selectMode ? (setSelectMode(false), clearSelection()) : setSelectMode(true))}
            aria-pressed={selectMode}
            aria-label={selectMode ? 'Stop selecting' : 'Select ads'}
            className={headerBtn(selectMode)}
          >
            <CheckSquare size={18} weight="bold" />
            <span className="hidden sm:inline">{selectMode ? 'Done' : 'Select'}</span>
          </button>
          <button
            type="button"
            onClick={() => setHelp(true)}
            aria-label="Keyboard shortcuts"
            className={`${headerBtn(false)} hidden sm:flex`}
          >
            <Keyboard size={18} weight="bold" />
            <span className="hidden lg:inline">Keys</span>
          </button>
          <Link to="/ads/import" aria-label="Import ads" className={headerBtn(false)}>
            <DownloadSimple size={18} weight="bold" />
            <span className="hidden sm:inline">Import</span>
          </Link>
          <Link
            to="/ads/add"
            aria-label="Add ad"
            className="press flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-2xl bg-accent text-black font-semibold shadow-cta"
          >
            <PlusCircle size={20} weight="bold" />
            <span className="hidden sm:inline">Add ad</span>
          </Link>
        </div>
      </div>

      {showLocalHint && (
        <p className="text-[13px] text-ink-soft -mt-3 mb-4">
          Searching in the browser. Re-run db-setup.sql to search on the server.
        </p>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 min-h-[44px] bg-card border border-line rounded-2xl px-3">
          <MagnifyingGlass size={18} className="text-ink-soft flex-shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand, hook, copy, tags..."
            aria-label="Search ads"
            maxLength={200}
            className="w-full min-w-0 min-h-[44px] py-2.5 bg-transparent focus:outline-none text-[16px] sm:text-[14px]"
          />
        </div>
        <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0">
          {WHO.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => change('who', w.id)}
              aria-pressed={filters.who === w.id}
              className={`press flex-shrink-0 min-h-[44px] min-w-[44px] justify-center px-3.5 rounded-2xl text-[13px] font-semibold transition-colors ${
                filters.who === w.id ? 'bg-ink text-black' : 'bg-card border border-line text-ink-soft'
              }`}
            >
              {w.label}
            </button>
          ))}
          <select
            value={filters.sort}
            onChange={(e) => change('sort', e.target.value)}
            aria-label="Sort ads"
            className={selectCls(false)}
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
      <div className="sticky top-0 z-30 sm:static flex gap-1.5 scroll-x -mx-5 px-5 py-2 sm:py-0 sm:mx-0 sm:px-0 mb-4 sm:mb-5 bg-canvas/85 backdrop-blur-xl sm:bg-transparent sm:backdrop-blur-none">
        <button
          type="button"
          onClick={() => change('starred', !filters.starred)}
          aria-pressed={filters.starred}
          className={`press flex-shrink-0 flex items-center gap-1.5 min-h-[44px] min-w-[44px] justify-center px-3.5 rounded-2xl text-[13px] font-semibold transition-colors ${
            filters.starred ? 'bg-amber-400 text-black' : 'bg-card border border-line text-ink-soft'
          }`}
        >
          <Star size={16} weight={filters.starred ? 'fill' : 'bold'} />
          Starred
          {facets.starred > 0 && (
            <span className={`tabular-nums ${filters.starred ? 'text-black/60' : 'text-ink-soft/70'}`}>{fmt(facets.starred)}</span>
          )}
        </button>
        {(facets.recent > 0 || filters.recent) && (
          <button type="button" onClick={() => change('recent', !filters.recent)} aria-pressed={filters.recent} className={pill(filters.recent)}>
            <ClockCounterClockwise size={15} weight="bold" /> New <span className="tabular-nums">{fmt(facets.recent)}</span>
          </button>
        )}
        <button type="button" onClick={() => change('proven', !filters.proven)} aria-pressed={filters.proven} className={pill(filters.proven)}>
          <Trophy size={15} weight="bold" /> Proven
        </button>
        <span className="w-px bg-line flex-shrink-0 mx-1 my-1.5" />
        {['all', ...VERDICTS.filter((v) => v !== 'unsure'), 'unsure'].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => change('verdict', v)}
            aria-pressed={filters.verdict === v}
            className={`${pill(filters.verdict === v)} capitalize`}
          >
            {v}
          </button>
        ))}
        {(countries.length > 0 || facets.geo_checked > 0 || angles.length > 0 || tags.length > 0) && (
          <span className="w-px bg-line flex-shrink-0 mx-1 my-1.5" />
        )}
        {angles.length > 0 && (
          <select value={filters.angle} onChange={(e) => change('angle', e.target.value)} aria-label="Filter by angle" className={selectCls(filters.angle !== 'all')}>
            <option value="all">Any angle</option>
            <option value="none">No angle yet</option>
            {angles.map((a) => (
              <option key={a.angle} value={a.angle}>
                {angleLabel(a.angle)} ({fmt(a.count)})
              </option>
            ))}
          </select>
        )}
        {tags.length > 0 && (
          <select value={filters.tag} onChange={(e) => change('tag', e.target.value)} aria-label="Filter by tag" className={`${selectCls(Boolean(filters.tag))} max-w-[200px]`}>
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({fmt(t.count)})
              </option>
            ))}
          </select>
        )}
        {/* Geo. Hidden until sync-geo has written something: an empty
            country picker is just noise in the row. */}
        {countries.length > 0 && (
          <select value={filters.country} onChange={(e) => change('country', e.target.value)} aria-label="Filter by country" className={selectCls(filters.country !== 'all')}>
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {countryName(c.code)} ({fmt(c.count)})
              </option>
            ))}
          </select>
        )}
        {(facets.geo_checked > 0 || filters.geo !== 'all') && (
          <select value={filters.geo} onChange={(e) => change('geo', e.target.value)} aria-label="Filter by location data" className={selectCls(filters.geo !== 'all')}>
            <option value="all">Any geo</option>
            {GEO_STATUS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectMode && !selection.size && (
        <p className="text-[14px] text-ink-soft mb-3">Tap ads to select them, up to {MAX_SELECT} at a time.</p>
      )}

      {result?.partial && (
        <div role="alert" className="flex items-center gap-3 bg-card border border-line rounded-2xl pl-4 pr-1.5 py-1.5 mb-4">
          <p className="flex-1 min-w-0 text-[14px] text-ink leading-snug">
            Some ads failed to load: {result.error?.message}. The list may be incomplete.
          </p>
          <button type="button" onClick={reloadAll} className="press min-h-[44px] min-w-[44px] px-4 rounded-xl border border-line text-[13px] font-semibold">
            Retry
          </button>
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {loading && !result ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl3" />
          ))}
        </div>
      ) : result?.error && !result.partial ? (
        <div role="alert" className="max-w-[480px] mx-auto my-12 text-center">
          <p className="text-[16px] text-ink mb-1">Could not load the ads.</p>
          <p className="text-[14px] text-ink-soft mb-4 break-words">{result.error.message}</p>
          <button type="button" onClick={reloadAll} className="press inline-flex items-center min-h-[44px] px-5 rounded-2xl border border-line font-semibold">
            Retry
          </button>
        </div>
      ) : firstRun ? (
        <div className="max-w-[440px] mx-auto my-12 bg-card border border-line rounded-xl3 p-6 text-center">
          <Tray size={28} weight="bold" className="mx-auto mb-3 text-ink-soft" />
          <h2 className="text-[20px] font-semibold tracking-tight mb-2">Your swipe file is empty</h2>
          <p className="text-[15px] text-ink-soft leading-relaxed mb-5">
            Save an ad you liked, or bring in a batch from a CSV export.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link to="/ads/add" className="press inline-flex items-center justify-center min-h-[44px] px-5 rounded-2xl bg-accent text-black font-semibold">
              Add your first ad
            </Link>
            <Link to="/ads/import" className="press inline-flex items-center justify-center min-h-[44px] px-5 rounded-2xl border border-line font-semibold text-ink">
              Import a CSV
            </Link>
          </div>
        </div>
      ) : !rows.length ? (
        <div className="text-center py-20 text-ink-soft">
          <p className="mb-3 text-[16px]">No ads match.</p>
          {filtered && (
            <button
              type="button"
              onClick={() => setFilters(clearFilters(filters))}
              className="press inline-flex items-center min-h-[44px] px-4 rounded-2xl border border-line text-accent-dim font-semibold"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {rows.map((ad, i) => (
              <AdCard
                key={ad.id}
                ad={ad}
                selectable={selectMode}
                selected={selection.has(ad.id)}
                onToggleSelect={toggleSelect}
                focused={i === focusIndex}
                onAdChange={(next) => {
                  applyRows([next]);
                  invalidateLocalCache();
                  setFacetsKey((n) => n + 1);
                }}
              />
            ))}
          </div>

          <nav aria-label="Pages" className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[12px] sm:text-[13px] text-ink-soft tabular-nums">
              Showing {fmt(from)} to {fmt(to)} of {fmt(total)}
            </p>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goPage(page - 1)}
                  disabled={page <= 1 || loading}
                  className="press inline-flex items-center gap-1 min-h-[44px] min-w-[44px] px-3 rounded-2xl border border-line text-[13px] font-semibold disabled:opacity-40"
                >
                  <CaretLeft size={14} weight="bold" /> Previous
                </button>
                <span className="font-mono text-[12px] sm:text-[13px] text-ink-soft tabular-nums whitespace-nowrap">
                  Page {fmt(page)} of {fmt(pages)}
                </span>
                <button
                  type="button"
                  onClick={() => goPage(page + 1)}
                  disabled={page >= pages || loading}
                  className="press inline-flex items-center gap-1 min-h-[44px] min-w-[44px] px-3 rounded-2xl border border-line text-[13px] font-semibold disabled:opacity-40"
                >
                  Next <CaretRight size={14} weight="bold" />
                </button>
              </div>
            )}
          </nav>
        </>
      )}

      <BulkBar
        selected={selected}
        active={selectMode}
        pageCount={rows.length}
        full={full}
        onSelectPage={selectPage}
        onClear={clearSelection}
        onRowsChanged={applyRows}
        onDeleted={onDeleted}
        onChanged={() => setFacetsKey((n) => n + 1)}
      />
      <KeyHelp open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
