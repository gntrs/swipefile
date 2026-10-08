import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Star, CheckSquare, DownloadSimple, Keyboard, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { db, IS_DEMO } from '@/lib/db';
import { GEO_STATUS, VERDICTS, FOCUS_COUNTRIES, countryName, humanVerdictPatch } from '@/lib/ads';
import { ANGLE_IDS, angleLabel } from '@/lib/angles';
import { SORTS, DEFAULT_FILTERS, filtersFromParams, paramsFromFilters, isFiltered, clearFilters, withFilter } from '@/lib/library/filters';
import { loadPage, loadFacets, invalidateLocalCache, computeFacets, PAGE_SIZE, LOCAL_HINT_THRESHOLD } from '@/lib/library/query';
import { saveListContext } from '@/lib/library/listContext';
import { MAX_SELECT } from '@/lib/library/bulk';
import AdCard from '@/components/AdCard';
import { CardSkeleton } from '@/components/Skeleton';
import {
  Page,
  PageHeader,
  Button,
  IconButton,
  Toolbar,
  SearchField,
  Segmented,
  Chip,
  FilterPanel,
  FilterGroup,
  ActiveFilters,
  Meta,
  Notice,
  EmptyState,
  GRID_CARDS,
  selectCls,
  useMedia,
} from '@/components/ui';
import BulkBar from '@/features/save/BulkBar';
import KeyHelp from '@/features/save/KeyHelp';
import useLibraryKeys from '@/features/save/useLibraryKeys';

const WHO = [
  { id: 'all', label: 'All' },
  { id: 'ours', label: 'Ours' },
  { id: 'rivals', label: 'Rivals' },
];

// Unsure goes last: it is the "not decided" bucket.
const VERDICT_OPTIONS = [
  { id: 'all', label: 'All' },
  ...[...VERDICTS.filter((v) => v !== 'unsure'), 'unsure'].map((v) => ({ id: v, label: v[0].toUpperCase() + v.slice(1) })),
];

const EMPTY_FACETS = computeFacets([]);
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// The sort box in the toolbar: the same edge as the search, sized to its text.
const sortCls =
  'min-h-[44px] rounded-xl bg-white/[0.03] border border-line pl-3.5 pr-2 text-ui text-ink cursor-pointer transition-colors';

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

  // The sort box joins the toolbar row only when the search keeps its room;
  // under 1280 it is the first group inside Filters.
  const wide = useMedia('(min-width: 1280px)');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const selecting = selectMode || selection.size > 0;
  const reset = (k) => () => change(k, DEFAULT_FILTERS[k]);

  // Every filter that is on, as a chip that clears its own key. Search, who,
  // sort and starred have their own controls in the toolbar, so they stay out.
  const active = [
    filters.recent && { key: 'recent', label: 'New', onRemove: reset('recent') },
    filters.proven && { key: 'proven', label: 'Proven', onRemove: reset('proven') },
    filters.verdict !== 'all' && {
      key: 'verdict',
      label: VERDICT_OPTIONS.find((o) => o.id === filters.verdict)?.label || filters.verdict,
      onRemove: reset('verdict'),
    },
    filters.angle !== 'all' && {
      key: 'angle',
      label: `Angle: ${filters.angle === 'none' ? 'No angle yet' : angleLabel(filters.angle)}`,
      onRemove: reset('angle'),
    },
    filters.tag && { key: 'tag', label: `Tag: ${filters.tag}`, onRemove: reset('tag') },
    filters.country !== 'all' && { key: 'country', label: `Country: ${countryName(filters.country)}`, onRemove: reset('country') },
    filters.geo !== 'all' && {
      key: 'geo',
      label: `Location: ${GEO_STATUS.find((g) => g.id === filters.geo)?.label || filters.geo}`,
      onRemove: reset('geo'),
    },
  ].filter(Boolean);

  const sortSelect = (cls, id) => (
    <select id={id} value={filters.sort} onChange={(e) => change('sort', e.target.value)} aria-label="Sort ads" className={cls}>
      {SORTS.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );

  const toggleSelectMode = () => {
    if (selectMode) {
      setSelectMode(false);
      clearSelection();
    } else setSelectMode(true);
  };

  return (
    <Page id="library">
      <PageHeader
        title={filters.starred ? 'Starred ads' : 'Ad library'}
        context={
          filters.starred ? (
            `${fmt(facets.starred)} starred`
          ) : (
            <Meta items={[`${fmt(facets.total)} saved`, `${fmt(facets.proven)} proven`, `${fmt(facets.starred)} starred`]} />
          )
        }
        actions={
          <>
            <IconButton label="Keyboard shortcuts" icon={Keyboard} onClick={() => setHelp(true)} className="hidden lg:inline-flex" />
            <Button variant="ghost" to="/ads/import" icon={DownloadSimple} aria-label="Import ads">
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button
              variant="secondary"
              icon={CheckSquare}
              onClick={toggleSelectMode}
              aria-pressed={selectMode}
              aria-label={selectMode ? 'Stop selecting' : 'Select ads'}
            >
              <span className="hidden sm:inline">{selectMode ? 'Done' : 'Select'}</span>
            </Button>
            <Button variant="primary" to="/ads/add" icon={Plus} aria-label="Add ad">
              <span className="hidden sm:inline">Add ad</span>
            </Button>
          </>
        }
      />

      {showLocalHint && (
        <Notice tone="info" className="mb-4">
          Searching in the browser. Re-run db-setup.sql to search on the server.
        </Notice>
      )}

      {/* One row from lg. On a phone the search sits alone and the row under
          it sticks to the top of the scroll, so the controls you steer with
          never scroll out of reach. */}
      <Toolbar
        sticky
        search={
          <SearchField
            inputRef={searchRef}
            value={search}
            onChange={setSearch}
            placeholder="Search brand, hook, copy, tags..."
            label="Search ads"
            maxLength={200}
          />
        }
      >
        <Segmented label="Whose ads" options={WHO} value={filters.who} onChange={(id) => change('who', id)} className="flex-shrink-0" />
        <Chip
          pressed={filters.starred}
          onClick={() => change('starred', !filters.starred)}
          aria-label="Starred"
          icon={<Star size={16} weight={filters.starred ? 'fill' : 'bold'} aria-hidden="true" className="flex-shrink-0" />}
        >
          {/* Icon only on a phone, where the row has no room for words. */}
          <span className="hidden sm:inline">Starred</span>
          {facets.starred > 0 && <span className={`hidden sm:inline num text-small ${filters.starred ? 'text-ink' : 'text-ink-soft'}`}>{fmt(facets.starred)}</span>}
        </Chip>
        {wide && sortSelect(sortCls)}
        <FilterPanel count={active.length} open={filtersOpen} onOpenChange={setFiltersOpen} onClear={() => setFilters(clearFilters(filters))}>
          {!wide && <FilterGroup label="Sort by">{sortSelect(selectCls)}</FilterGroup>}
          <FilterGroup label="Show">
            {(facets.recent > 0 || filters.recent) && (
              <Chip pressed={filters.recent} onClick={() => change('recent', !filters.recent)} count={fmt(facets.recent)}>
                New
              </Chip>
            )}
            <Chip pressed={filters.proven} onClick={() => change('proven', !filters.proven)}>
              Proven
            </Chip>
          </FilterGroup>
          <FilterGroup label="Verdict">
            {/* One pick of five. Chips rather than a segmented track, so the
                options wrap inside the popover instead of scrolling. */}
            {VERDICT_OPTIONS.map((o) => (
              <Chip key={o.id} pressed={filters.verdict === o.id} onClick={() => change('verdict', o.id)}>
                {o.label}
              </Chip>
            ))}
          </FilterGroup>
          {(angles.length > 0 || filters.angle !== 'all') && (
            <FilterGroup label="Angle">
              <select value={filters.angle} onChange={(e) => change('angle', e.target.value)} aria-label="Filter by angle" className={selectCls}>
                <option value="all">Any angle</option>
                <option value="none">No angle yet</option>
                {angles.map((a) => (
                  <option key={a.angle} value={a.angle}>
                    {angleLabel(a.angle)} ({fmt(a.count)})
                  </option>
                ))}
              </select>
            </FilterGroup>
          )}
          {tags.length > 0 && (
            <FilterGroup label="Tag">
              <select value={filters.tag} onChange={(e) => change('tag', e.target.value)} aria-label="Filter by tag" className={selectCls}>
                <option value="">Any tag</option>
                {tags.map((t) => (
                  <option key={t.tag} value={t.tag}>
                    {t.tag} ({fmt(t.count)})
                  </option>
                ))}
              </select>
            </FilterGroup>
          )}
          {/* Geo. Hidden until sync-geo has written something: an empty
              country picker is just noise. */}
          {countries.length > 0 && (
            <FilterGroup label="Country">
              <select value={filters.country} onChange={(e) => change('country', e.target.value)} aria-label="Filter by country" className={selectCls}>
                <option value="all">All countries</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {countryName(c.code)} ({fmt(c.count)})
                  </option>
                ))}
              </select>
            </FilterGroup>
          )}
          {(facets.geo_checked > 0 || filters.geo !== 'all') && (
            <FilterGroup label="Location data">
              <select value={filters.geo} onChange={(e) => change('geo', e.target.value)} aria-label="Filter by location data" className={selectCls}>
                <option value="all">Any geo</option>
                {GEO_STATUS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </FilterGroup>
          )}
        </FilterPanel>
      </Toolbar>

      <ActiveFilters items={active} onClearAll={() => setFilters(clearFilters(filters))} />

      {selectMode && !selection.size && (
        <p className="text-body text-ink-soft mb-4">Tap ads to select them, up to {MAX_SELECT} at a time.</p>
      )}

      {result?.partial && (
        <Notice
          tone="warn"
          className="mb-4"
          action={
            <Button variant="secondary" onClick={reloadAll}>
              Retry
            </Button>
          }
        >
          Some ads failed to load: {result.error?.message}. The list may be incomplete.
        </Notice>
      )}

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {loading && !result ? (
        <div className={GRID_CARDS} aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : result?.error && !result.partial ? (
        <div role="alert">
          <EmptyState
            page
            title="Could not load the ads."
            text={<span className="break-words">{result.error.message}</span>}
            action={
              <Button variant="secondary" onClick={reloadAll}>
                Retry
              </Button>
            }
          />
        </div>
      ) : firstRun ? (
        <EmptyState
          page
          title="Your swipe file is empty"
          text="Save an ad you liked, or bring in a batch from a CSV export."
          action={
            <>
              <Button variant="primary" to="/ads/add">
                Add your first ad
              </Button>
              <Button variant="secondary" to="/ads/import">
                Import a CSV
              </Button>
            </>
          }
        />
      ) : !rows.length ? (
        <EmptyState
          page
          title="No ads match."
          text={filtered ? 'Try fewer filters or a shorter search.' : undefined}
          action={
            filtered && (
              <Button variant="secondary" onClick={() => setFilters(clearFilters(filters))}>
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className={`${GRID_CARDS} transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
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

          <nav aria-label="Pages" className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <p className="text-small text-ink-soft">
              Showing {fmt(from)} to {fmt(to)} of {fmt(total)}
            </p>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="secondary" icon={CaretLeft} onClick={() => goPage(page - 1)} disabled={page <= 1 || loading}>
                  Previous
                </Button>
                <span className="text-small text-ink-soft whitespace-nowrap px-1">
                  Page {fmt(page)} of {fmt(pages)}
                </span>
                <Button variant="secondary" onClick={() => goPage(page + 1)} disabled={page >= pages || loading}>
                  Next <CaretRight size={16} weight="bold" aria-hidden="true" />
                </Button>
              </div>
            )}
          </nav>
        </>
      )}

      {/* Room under the last card so the bulk bar never covers it. */}
      {selecting && <div aria-hidden="true" className="h-56 lg:h-32" />}

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
    </Page>
  );
}
