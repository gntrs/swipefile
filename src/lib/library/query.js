// Library search: filters, sort order and paging for /ads.
//
// Two implementations of the same rules. The database does it in the
// search_ads() and library_facets() functions from db-setup.sql; this file is
// the local twin, used in demo mode and on projects that have not re-run the
// SQL yet (the rpc answers "function missing"). Change both together: a parity
// check runs every filter and sort through both and compares the ids in order.
//
// The rules:
// - who: 'ours' keeps rows whose brand, trimmed and lowercased, equals the own
//   brand; 'rivals' keeps the rest. With no own brand set, 'ours' is empty and
//   'rivals' is everything.
// - verdict: exact match. proven: verdict winner, or metrics.days_running read
//   as a number (sfNum, same as the SQL sf_num) at least 30. starred:
//   metrics.starred is the JSON boolean true, nothing else. recent: the
//   recently-added tag. geo: geoStatus(ad) equals it. country: one of
//   adCountries(ad). angle: 'none' means metrics.angle is null or missing,
//   anything else is an exact match. tag: an exact element of tags.
// - q: trimmed and lowercased. A row matches when brand, hook, ad_copy,
//   platform (each when not empty) and the tags joined by spaces, all joined
//   by spaces and lowercased, contain it as a plain substring. No wildcards.
// - Sort: newest is created_at desc. longest is metrics.days_running desc when
//   it is a JSON number, others last. impressions is the positive number from
//   metrics.impressions, else from metrics.reach, desc, others last. roas, ctr
//   and spend are the positive number desc, cpc the positive number asc,
//   others last. A positive number is sfNum(value) above 0 (SQL: sf_pos): a
//   JSON number, or a string that is plainly a decimal number. Every sort then
//   breaks ties by created_at desc, then id desc (lowercase uuid strings
//   compare like Postgres uuids).
// - Rows tagged recently-added come first whatever the sort (a stable
//   partition), exactly as the library always did.
// - Paging: PAGE_SIZE rows a page, page is 1 based, total is the filtered
//   count. A page past the end clamps to the last page.
// - created_at compares as Date.parse milliseconds here. Postgres keeps
//   microseconds, so two rows created in the same millisecond can order
//   differently in the two twins. The local twin only runs in demo mode and on
//   the older SQL, so that is accepted.
// - Text case: JS lowercases Unicode; Postgres lower() depends on the
//   database locale (Supabase uses a UTF-8 locale, which agrees).
import { db, fetchAll } from '../db.js';
import { OWN_BRAND } from '../brand.js';
import { RECENT_TAG, adCountries, geoStatus } from '../ads.js';
import { DEFAULT_FILTERS } from './filters.js';

export const PAGE_SIZE = 48;
// Above this many ads, a live project searching in the browser gets a hint to
// re-run the SQL.
export const LOCAL_HINT_THRESHOLD = 2000;

const NUM_RE = /^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;

// The number a jsonb value reads as, exactly like the SQL sf_num(metrics->>key):
// a finite JSON number, or a string that is a plain decimal (optionally with
// an exponent). Booleans, arrays, hex and the like are not numbers.
export function sfNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v)) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// SQL sf_pos: the number when it is above zero, else null.
export function sfPos(v) {
  const n = sfNum(v);
  return n !== null && n > 0 ? n : null;
}

const lowerTrim = (s) => String(s ?? '').trim().toLowerCase();
const tagsOf = (a) => (Array.isArray(a?.tags) ? a.tags : []);
const metricsOf = (a) => (a?.metrics && typeof a.metrics === 'object' ? a.metrics : {});
const hasTag = (a, t) => tagsOf(a).includes(t);
const isOurs = (a, own) => Boolean(own) && lowerTrim(a?.brand) === own;

export const isProvenRow = (a) => a?.verdict === 'winner' || (sfNum(metricsOf(a).days_running) ?? 0) >= 30;
export const isStarredRow = (a) => metricsOf(a).starred === true;

// The text q is searched in: SQL concat_ws(' ', nullif(brand, ''), ...,
// nullif(array_to_string(tags, ' '), '')).
function searchText(a) {
  const parts = [];
  for (const k of ['brand', 'hook', 'ad_copy', 'platform']) {
    const v = a?.[k];
    if (v !== null && v !== undefined && v !== '') parts.push(String(v));
  }
  const tags = tagsOf(a).filter((t) => t !== null && t !== undefined).join(' ');
  if (tags !== '') parts.push(tags);
  return parts.join(' ').toLowerCase();
}

// The object sent to search_ads(p). Booleans are real booleans, q is trimmed,
// own_brand is the lowercased own brand ('' when none).
export function rpcParams(f = {}, { ownBrand = OWN_BRAND } = {}) {
  const x = { ...DEFAULT_FILTERS, ...f };
  return {
    q: String(x.q ?? '').trim(),
    verdict: x.verdict,
    who: x.who,
    proven: Boolean(x.proven),
    starred: Boolean(x.starred),
    recent: Boolean(x.recent),
    country: x.country,
    geo: x.geo,
    angle: x.angle,
    tag: x.tag || '',
    sort: x.sort,
    own_brand: lowerTrim(ownBrand),
  };
}

export function applyFilters(ads, f = {}, { ownBrand = OWN_BRAND } = {}) {
  const x = { ...DEFAULT_FILTERS, ...f };
  const own = lowerTrim(ownBrand);
  const term = String(x.q ?? '').trim().toLowerCase();
  return (ads || []).filter((a) => {
    const m = metricsOf(a);
    if (x.verdict !== 'all' && a?.verdict !== x.verdict) return false;
    if (x.who === 'ours' && !isOurs(a, own)) return false;
    if (x.who === 'rivals' && isOurs(a, own)) return false;
    if (x.proven && !isProvenRow(a)) return false;
    if (x.starred && !isStarredRow(a)) return false;
    if (x.recent && !hasTag(a, RECENT_TAG)) return false;
    if (x.geo !== 'all' && geoStatus(a) !== x.geo) return false;
    if (x.country !== 'all' && !adCountries(a).includes(String(x.country).toUpperCase())) return false;
    if (x.angle === 'none' && m.angle !== null && m.angle !== undefined) return false;
    if (x.angle !== 'all' && x.angle !== 'none' && m.angle !== x.angle) return false;
    if (x.tag && !hasTag(a, x.tag)) return false;
    if (term && !searchText(a).includes(term)) return false;
    return true;
  });
}

// The value a sort orders by, or null when the row goes last.
function sortKey(a, sort) {
  const m = metricsOf(a);
  switch (sort) {
    case 'longest':
      return typeof m.days_running === 'number' && Number.isFinite(m.days_running) ? m.days_running : null;
    case 'impressions':
      return sfPos(m.impressions) ?? sfPos(m.reach);
    case 'roas':
    case 'ctr':
    case 'spend':
    case 'cpc':
      return sfPos(m[sort]);
    default:
      return null;
  }
}

const createdMs = (a) => {
  const t = Date.parse(a?.created_at ?? '');
  return Number.isFinite(t) ? t : null;
};

// Descending with nulls last.
function descNullsLast(x, y) {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x === y ? 0 : x > y ? -1 : 1;
}

export function sortAds(ads, sort = 'newest') {
  const asc = sort === 'cpc';
  const rows = [...(ads || [])];
  const keys = new Map(rows.map((a) => [a, sortKey(a, sort)]));
  rows.sort((a, b) => {
    const ra = hasTag(a, RECENT_TAG);
    const rb = hasTag(b, RECENT_TAG);
    if (ra !== rb) return ra ? -1 : 1;
    const ka = keys.get(a);
    const kb = keys.get(b);
    if (ka !== null || kb !== null) {
      if (ka === null) return 1;
      if (kb === null) return -1;
      if (ka !== kb) return asc ? (ka < kb ? -1 : 1) : ka > kb ? -1 : 1;
    }
    const c = descNullsLast(createdMs(a), createdMs(b));
    if (c) return c;
    const ia = String(a?.id ?? '').toLowerCase();
    const ib = String(b?.id ?? '').toLowerCase();
    return ia === ib ? 0 : ia > ib ? -1 : 1;
  });
  return rows;
}

export function queryAds(ads, f = {}, ctx = {}) {
  return sortAds(applyFilters(ads, f, ctx), (f && f.sort) || 'newest');
}

// Postgres collate "C" order for plain strings (code unit order, which equals
// byte order for everything below the surrogate range).
const cCompare = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
const byCountThenKey = (key) => (x, y) => y.count - x.count || cCompare(x[key], y[key]);

// Same JSON shape and order as library_facets().
export function computeFacets(ads) {
  const rows = ads || [];
  const countries = new Map();
  const tags = new Map();
  const angles = new Map();
  let proven = 0;
  let starred = 0;
  let recent = 0;
  let geoChecked = 0;
  for (const a of rows) {
    if (isProvenRow(a)) proven++;
    if (isStarredRow(a)) starred++;
    if (hasTag(a, RECENT_TAG)) recent++;
    if (geoStatus(a) !== 'unknown') geoChecked++;
    for (const c of adCountries(a)) countries.set(c, (countries.get(c) || 0) + 1);
    for (const t of tagsOf(a)) {
      if (t === null || t === undefined || t === '' || t === RECENT_TAG) continue;
      tags.set(t, (tags.get(t) || 0) + 1);
    }
    const g = metricsOf(a).angle;
    if (g !== null && g !== undefined) {
      const key = typeof g === 'string' ? g : JSON.stringify(g);
      angles.set(key, (angles.get(key) || 0) + 1);
    }
  }
  return {
    total: rows.length,
    proven,
    starred,
    recent,
    geo_checked: geoChecked,
    countries: [...countries].map(([code, count]) => ({ code, count })).sort(byCountThenKey('code')),
    tags: [...tags].map(([tag, count]) => ({ tag, count })).sort(byCountThenKey('tag')).slice(0, 50),
    angles: [...angles].map(([angle, count]) => ({ angle, count })).sort(byCountThenKey('angle')),
  };
}

// An rpc error that means "this function is not in the database yet".
export function isMissingFunction(result) {
  const code = result?.error?.code;
  return code === 'PGRST202' || code === '42883' || (Boolean(result?.error) && result?.status === 404);
}

// A range past the last row.
const isRangeError = (result) => result?.error?.code === 'PGRST103' || result?.status === 416;

// ---- the local copy of the ads table, loaded once per session ------------

let localCache = null; // Promise<rows>

async function localAds(client) {
  if (!localCache) {
    localCache = fetchAll((q) => q.order('created_at', { ascending: false }), 'ads', { client }).then((rows) => {
      // A partial load is not cached, so the next call tries again.
      if (rows?.error) localCache = null;
      return rows;
    });
  }
  return localCache;
}

export function invalidateLocalCache() {
  localCache = null;
}

// A save anywhere in the app (Add, import, capture) makes the copy stale.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('sf:ads-saved', invalidateLocalCache);
}

const pagesFor = (total) => Math.max(1, Math.ceil(total / PAGE_SIZE));
const clampPage = (page, pages) => Math.min(Math.max(1, Math.floor(Number(page) || 1)), pages);
const errorOf = (e, fallback) => ({ code: e?.code || 'error', message: e?.message || fallback });

async function localPage(f, { client, ownBrand }) {
  const all = await localAds(client);
  const hits = queryAds(all, f, { ownBrand });
  const total = hits.length;
  const pages = pagesFor(total);
  const page = clampPage(f.page, pages);
  const from = (page - 1) * PAGE_SIZE;
  return {
    rows: hits.slice(from, from + PAGE_SIZE),
    total,
    page,
    pages,
    mode: 'local',
    error: all?.error ? errorOf(all.error, 'Some ads failed to load.') : null,
    partial: Boolean(all?.error),
    scanned: all.length,
  };
}

async function rpcRange(client, p, page) {
  const from = (page - 1) * PAGE_SIZE;
  try {
    return await client.rpc('search_ads', { p }, { count: 'exact' }).range(from, from + PAGE_SIZE - 1);
  } catch (err) {
    return { data: null, error: { message: err?.message || String(err) } };
  }
}

// One page of the library. Never throws.
export async function loadPage(f = {}, { client = db, ownBrand = OWN_BRAND } = {}) {
  const filters = { ...DEFAULT_FILTERS, ...f };
  const p = rpcParams(filters, { ownBrand });
  let page = clampPage(filters.page, Infinity);
  let result = await rpcRange(client, p, page);

  if (isMissingFunction(result)) {
    try {
      return await localPage({ ...filters, page }, { client, ownBrand });
    } catch (err) {
      return { rows: [], total: 0, page: 1, pages: 1, mode: 'local', error: errorOf(err, 'Could not load the ads.') };
    }
  }

  // Past the end: ask for page 1 to learn the total, then fetch the last page.
  if (isRangeError(result) || (!result?.error && page > 1 && !(result?.data || []).length)) {
    const first = await rpcRange(client, p, 1);
    if (first?.error) result = first;
    else {
      const last = pagesFor(first.count ?? (first.data || []).length);
      page = Math.min(page, last);
      result = page === 1 ? first : await rpcRange(client, p, page);
    }
  }

  if (result?.error) {
    return { rows: [], total: 0, page, pages: 1, mode: 'rpc', error: errorOf(result.error, 'Could not load the ads.') };
  }
  const rows = result.data || [];
  const total = typeof result.count === 'number' ? result.count : (page - 1) * PAGE_SIZE + rows.length;
  return { rows, total, page, pages: pagesFor(total), mode: 'rpc', error: null };
}

// The counts and option lists for the filter controls. Never throws:
// -> { facets, mode, error }.
export async function loadFacets({ client = db } = {}) {
  let result;
  try {
    result = await client.rpc('library_facets');
  } catch (err) {
    result = { data: null, error: { message: err?.message || String(err) } };
  }
  if (!result?.error && result?.data) return { facets: result.data, mode: 'rpc', error: null };
  if (isMissingFunction(result)) {
    try {
      const all = await localAds(client);
      return { facets: computeFacets(all), mode: 'local', error: null };
    } catch (err) {
      return { facets: computeFacets([]), mode: 'local', error: errorOf(err, 'Could not count the ads.') };
    }
  }
  return { facets: computeFacets([]), mode: 'rpc', error: errorOf(result?.error, 'Could not count the ads.') };
}
