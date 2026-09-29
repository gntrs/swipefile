// Change many ads in one action: verdict, star, tags, delete.
//
// Verdict, star and tags go through the bulk_update_ads() database function in
// one call. On a project that has not re-run db-setup.sql yet the function is
// missing, so each ad is updated on its own, four at a time, with the same
// rules: a verdict is always written as a person's verdict (humanVerdictPatch),
// tags keep their order and lose duplicates and empty ones.
//
// Every function resolves { ok, done, failed: [{ id, message }], rows } and
// never throws. rows are the changed ads as the page should now show them.
import { db } from '../db.js';
import { humanVerdictPatch, VERDICTS } from '../ads.js';
import { removeMedia } from '../saveAd.js';
import { invalidateLocalCache, isMissingFunction } from './query.js';

export const MAX_SELECT = 500;
const RPC_CHUNK = 500;
const DELETE_CHUNK = 100;
const PARALLEL = 4;

const chunks = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const messageOf = (e, fallback = 'Update failed.') => String(e?.message || e || fallback);

// Same result as the SQL: existing tags plus added ones, first occurrence
// wins, empty and removed tags dropped. No change when both lists are empty.
export function nextTags(tags, { add = [], remove = [] } = {}) {
  const current = Array.isArray(tags) ? tags : [];
  if (!add.length && !remove.length) return current;
  const out = [];
  for (const t of [...current, ...add]) {
    if (t === null || t === undefined || t === '' || remove.includes(t) || out.includes(t)) continue;
    out.push(t);
  }
  return out;
}

function cleanList(list) {
  const out = [];
  for (const t of Array.isArray(list) ? list : [list]) {
    const s = String(t ?? '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

const validAds = (ads) => (Array.isArray(ads) ? ads : []).filter((a) => a && typeof a.id === 'string' && a.id);

// Runs fn over items, `limit` at a time, keeping order in the results.
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// The shared engine for verdict, star and tags. patchFor(ad) -> the update
// for one ad when the function is missing; applyLocal(ad) -> the row as shown.
async function bulkUpdate(ads, rpcPatch, patchFor, applyLocal, { client = db, onProgress } = {}) {
  const list = validAds(ads);
  const total = list.length;
  const failed = [];
  const rows = [];
  let done = 0;
  const progress = () => {
    try {
      onProgress?.(done + failed.length, total);
    } catch {
      /* a progress callback never breaks the action */
    }
  };
  if (!total) return { ok: true, done: 0, failed, rows };

  let fallback = false;
  for (const part of chunks(list, RPC_CHUNK)) {
    if (fallback) break;
    let result;
    try {
      result = await client.rpc('bulk_update_ads', { p_ids: part.map((a) => a.id), p_patch: rpcPatch });
    } catch (err) {
      result = { data: null, error: { message: messageOf(err) } };
    }
    if (isMissingFunction(result)) {
      fallback = true;
      break;
    }
    if (result?.error) {
      for (const a of part) failed.push({ id: a.id, message: messageOf(result.error) });
    } else {
      done += part.length;
      for (const a of part) rows.push(applyLocal(a));
    }
    progress();
  }

  if (fallback) {
    const remaining = list.slice(done + failed.length);
    await pool(remaining, PARALLEL, async (a) => {
      const patch = patchFor(a);
      let result;
      try {
        result = await client.from('ads').update(patch).eq('id', a.id);
      } catch (err) {
        result = { error: { message: messageOf(err) } };
      }
      if (result?.error) failed.push({ id: a.id, message: messageOf(result.error) });
      else {
        done++;
        rows.push({ ...a, ...patch });
      }
      progress();
    });
  }

  invalidateLocalCache();
  return { ok: failed.length === 0, done, failed, rows };
}

function refuse(ads, message) {
  return { ok: false, done: 0, failed: validAds(ads).map((a) => ({ id: a.id, message })), rows: [] };
}

export async function bulkVerdict(ads, verdict, opts = {}) {
  if (!VERDICTS.includes(verdict)) return refuse(ads, `Unknown verdict: ${verdict}`);
  const now = opts.now || new Date();
  return bulkUpdate(
    ads,
    { verdict },
    (a) => humanVerdictPatch(a, verdict, now),
    (a) => ({ ...a, ...humanVerdictPatch(a, verdict, now) }),
    opts
  );
}

export async function bulkStar(ads, starred, opts = {}) {
  if (typeof starred !== 'boolean') return refuse(ads, 'Star must be true or false.');
  const patch = (a) => ({ metrics: { ...(a.metrics || {}), starred } });
  return bulkUpdate(ads, { starred }, patch, (a) => ({ ...a, ...patch(a) }), opts);
}

export async function bulkTags(ads, { add = [], remove = [] } = {}, opts = {}) {
  const lists = { add: cleanList(add), remove: cleanList(remove) };
  const patch = (a) => ({ tags: nextTags(a.tags, lists) });
  return bulkUpdate(ads, { add_tags: lists.add, remove_tags: lists.remove }, patch, (a) => ({ ...a, ...patch(a) }), opts);
}

export async function bulkDelete(ads, { client = db, onProgress } = {}) {
  const list = validAds(ads);
  const failed = [];
  const deleted = [];
  for (const part of chunks(list, DELETE_CHUNK)) {
    let result;
    try {
      result = await client.from('ads').delete().in('id', part.map((a) => a.id));
    } catch (err) {
      result = { error: { message: messageOf(err) } };
    }
    if (result?.error) for (const a of part) failed.push({ id: a.id, message: messageOf(result.error, 'Delete failed.') });
    else deleted.push(...part);
    try {
      onProgress?.(deleted.length + failed.length, list.length);
    } catch {
      /* ignore */
    }
  }
  // Files go only after their rows are gone. Sample art is not in storage.
  for (const a of deleted) {
    if (a.media_path && !String(a.media_path).startsWith('demo/')) await removeMedia(a.media_path, { client });
  }
  invalidateLocalCache();
  return { ok: failed.length === 0, done: deleted.length, failed, rows: deleted };
}
