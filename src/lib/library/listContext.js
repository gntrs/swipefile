// The list the ad page walks with J and K: the ids of the library page last
// shown and the search that produced it, kept in sessionStorage so it lives
// as long as the tab. Every storage call is guarded: private windows and
// blocked storage just mean no list.

const KEY = 'sf:list';
// A list older than this is stale: the ad page ignores it.
export const LIST_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function store(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

export function saveListContext({ ids = [], search = '' } = {}, { storage, now = Date.now() } = {}) {
  const s = store(storage);
  if (!s) return false;
  try {
    const clean = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && id);
    s.setItem(KEY, JSON.stringify({ ids: clean, search: typeof search === 'string' ? search : '', at: now }));
    return true;
  } catch {
    return false;
  }
}

// -> { ids, search, at } or null when missing, broken or stale.
export function readListContext({ storage, now = Date.now() } = {}) {
  const s = store(storage);
  if (!s) return null;
  let raw;
  try {
    raw = s.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let ctx;
  try {
    ctx = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!ctx || !Array.isArray(ctx.ids)) return null;
  const at = Number(ctx.at);
  if (!Number.isFinite(at) || now - at > LIST_MAX_AGE_MS) return null;
  const search = typeof ctx.search === 'string' && (ctx.search === '' || ctx.search.startsWith('?')) ? ctx.search : '';
  return { ids: ctx.ids.filter((id) => typeof id === 'string' && id), search, at };
}

// Where J and K go from this ad: { prev, next, index, search }. prev and next
// are null at the ends of the page, index is -1 when the ad is not on it.
export function neighbours(id, ctx = readListContext()) {
  const ids = ctx?.ids || [];
  const index = ids.indexOf(id);
  return {
    prev: index > 0 ? ids[index - 1] : null,
    next: index !== -1 && index < ids.length - 1 ? ids[index + 1] : null,
    index,
    search: ctx?.search || '',
  };
}
