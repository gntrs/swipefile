// The library's filters, read from and written to the URL, so a filtered view
// survives a reload and can be linked to. Pure: no React, no database.
import { VERDICTS, GEO_STATUS } from '../ads.js';
import { ANGLE_IDS } from '../angles.js';

export const DEFAULT_FILTERS = Object.freeze({
  q: '', verdict: 'all', who: 'all', proven: false, starred: false, recent: false,
  country: 'all', geo: 'all', angle: 'all', tag: '', sort: 'newest', page: 1,
});

// Same ids and labels as the library had before filters moved to the URL.
export const SORTS = [
  { id: 'newest', label: 'Newest' }, { id: 'longest', label: 'Longest running' },
  { id: 'impressions', label: 'Most impressions' }, { id: 'roas', label: 'Best ROAS' },
  { id: 'ctr', label: 'Best CTR' }, { id: 'cpc', label: 'Lowest CPC' }, { id: 'spend', label: 'Most spent' },
];

export const WHO = ['all', 'ours', 'rivals'];
export const MAX_Q = 200;
export const MAX_TAG = 60;
export const MAX_PAGE = 10000;

const SORT_IDS = SORTS.map((s) => s.id);
const GEO_IDS = GEO_STATUS.map((g) => g.id);
const KEYS = Object.keys(DEFAULT_FILTERS);
const BOOLEAN_KEYS = KEYS.filter((k) => typeof DEFAULT_FILTERS[k] === 'boolean');

const oneOf = (list, value, fallback) => (list.includes(value) ? value : fallback);

// One value from the URL, checked. Anything invalid gives the default.
function readValue(key, raw) {
  const d = DEFAULT_FILTERS[key];
  if (raw === null || raw === undefined) return d;
  const s = String(raw);
  switch (key) {
    case 'q':
      return s.length <= MAX_Q ? s : d;
    case 'verdict':
      return oneOf(['all', ...VERDICTS], s, d);
    case 'who':
      return oneOf(WHO, s, d);
    case 'geo':
      return oneOf(['all', ...GEO_IDS], s, d);
    case 'angle':
      return oneOf(['all', 'none', ...ANGLE_IDS], s, d);
    case 'country': {
      if (s === 'all') return d;
      return /^[a-z]{2}$/i.test(s) ? s.toUpperCase() : d;
    }
    case 'tag': {
      const t = s.trim();
      return t && t.length <= MAX_TAG ? t : d;
    }
    case 'sort':
      return oneOf(SORT_IDS, s, d);
    case 'page': {
      if (!/^\d{1,5}$/.test(s)) return d;
      const n = Number(s);
      return n >= 1 && n <= MAX_PAGE ? n : d;
    }
    default:
      if (BOOLEAN_KEYS.includes(key)) return s === '1' || s === 'true';
      return d;
  }
}

// URLSearchParams (or anything with get()) -> a full filters object.
export function filtersFromParams(params) {
  const get = (k) => (params && typeof params.get === 'function' ? params.get(k) : null);
  const out = {};
  for (const key of KEYS) out[key] = readValue(key, get(key));
  return out;
}

// Filters -> URLSearchParams holding only what differs from the default, in
// DEFAULT_FILTERS order. Booleans are written as 1, page only when above 1.
export function paramsFromFilters(f = {}) {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = readValue(key, f[key] === undefined ? null : encodeValue(key, f[key]));
    if (value === DEFAULT_FILTERS[key]) continue;
    if (typeof value === 'boolean') params.set(key, '1');
    else if (key === 'page') {
      if (value > 1) params.set(key, String(value));
    } else params.set(key, String(value));
  }
  return params;
}

function encodeValue(key, value) {
  if (typeof DEFAULT_FILTERS[key] === 'boolean') return value ? '1' : '0';
  return value === null || value === undefined ? null : String(value);
}

// True when anything narrows the list. Sort and page only reorder or move.
export function isFiltered(f = {}) {
  return KEYS.some((k) => k !== 'sort' && k !== 'page' && differs(k, f[k]));
}

function differs(key, value) {
  if (key === 'q') return String(value ?? '').trim() !== '';
  if (value === undefined) return false;
  return value !== DEFAULT_FILTERS[key];
}

// Clear filters keeps the sort: it is a view preference, not a filter.
export function clearFilters(f = {}) {
  return { ...DEFAULT_FILTERS, sort: oneOf(SORT_IDS, f.sort, DEFAULT_FILTERS.sort) };
}

// A copy with one key changed. Any change except the page itself goes back to
// page 1, so a narrower result never opens on an empty page.
export function withFilter(f, key, value) {
  const next = { ...DEFAULT_FILTERS, ...f, [key]: value };
  if (key !== 'page') next.page = 1;
  return next;
}
