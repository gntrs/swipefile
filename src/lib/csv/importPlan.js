// Turns a parsed CSV into what the import page shows and writes: new rows,
// rows already saved, and problems. Pure apart from the lookups it is handed,
// so it is tested without a database. Plain relative imports only.
import { parseCsvWithLines } from './parse.js';
import { detectFormat, LIMITS, limitProblem } from './index.js';
import { metaColumns, aggregateMeta, metaRowFor } from './meta.js';
import { mapSwipeRows } from './swipe.js';

export const LOOKUP_CHUNK = 200;
export const INSERT_BATCH = 50;

// text -> { format, headers, rows, lines, error }. error is a sentence.
export function readCsv(text, { bytes = 0 } = {}) {
  const tooBig = limitProblem({ bytes });
  if (tooBig) return { format: null, error: tooBig };
  const { rows, lines } = parseCsvWithLines(text);
  if (rows.length < 2) return { format: null, error: 'That file has no data rows under its header.' };
  const dataRows = rows.length - 1;
  const tooMany = limitProblem({ rows: dataRows });
  if (tooMany) return { format: null, error: tooMany };
  const headers = rows[0];
  const format = detectFormat(headers);
  if (!format) {
    return {
      format: null,
      error: 'Could not tell what this file is. Use the template (brand, hook, copy...) or a Meta Ads Manager export with an Ad name column.',
    };
  }
  return { format, headers, rows: rows.slice(1), lines: lines.slice(1), error: null };
}

const chunks = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

// Swipe format plan. existingIds(ids) -> Promise<Set of library ids already
// saved>, asked in chunks of LOOKUP_CHUNK.
export async function planSwipe(parsed, { user, now = new Date(), existingIds }) {
  const { ads, errors } = mapSwipeRows(parsed.headers, parsed.rows, { user, now, lines: parsed.lines });
  const ids = [...new Set(ads.map((a) => a.metrics.ad_library_id).filter(Boolean))];
  const saved = new Set();
  for (const part of chunks(ids, LOOKUP_CHUNK)) {
    for (const id of await existingIds(part)) saved.add(id);
  }
  const fresh = [];
  const duplicates = [];
  const seen = new Set();
  for (const a of ads) {
    const id = a.metrics.ad_library_id;
    if (id && saved.has(id)) duplicates.push({ line: a._line, reason: 'already saved', ad: a });
    else if (id && seen.has(id)) duplicates.push({ line: a._line, reason: 'twice in this file', ad: a });
    else {
      if (id) seen.add(id);
      fresh.push(a);
    }
  }
  return { format: 'swipe', inserts: fresh.map(stripLine), updates: [], duplicates, errors, preview: fresh.slice(0, 20) };
}

// Meta format plan, written exactly like scripts/import-ads-csv.mjs: rows are
// matched by ad name among your own brand's ads; new names become new rows,
// known names get their metrics refreshed (verdict never touched).
// existingByName() -> Promise<Map of ad name -> { id, metrics }>.
export async function planMeta(parsed, { user, ownBrand, today = new Date().toISOString().slice(0, 10), existingByName }) {
  const col = metaColumns(parsed.headers);
  const byName = aggregateMeta(parsed.rows, col);
  const existing = await existingByName();
  const inserts = [];
  const updates = [];
  const preview = [];
  for (const [name, a] of byName) {
    const { fresh, status } = metaRowFor(name, a, today);
    const clean = JSON.parse(JSON.stringify(fresh));
    const found = existing.get(name);
    if (found) {
      updates.push({ id: found.id, name, patch: { metrics: { ...(found.metrics || {}), ...clean }, ...(status ? { status } : {}) } });
    } else {
      const row = {
        brand: ownBrand,
        platform: 'Facebook',
        format: 'video', // placeholder; fix per ad in the UI if it is an image
        status: status || 'running',
        verdict: 'testing',
        hook: name, // the ad name is the best label we have until someone edits
        metrics: clean,
        added_by_email: 'csv@import',
        added_by: user?.id ?? null,
      };
      inserts.push(row);
      if (preview.length < 20) preview.push(row);
    }
  }
  return { format: 'meta', inserts, updates, duplicates: [], errors: [], preview };
}

const stripLine = (a) => {
  const { _line, ...row } = a;
  return row;
};

export { LIMITS };
