// Daily Google Trends interest-over-time pull, per geo, into trends_interest.
//
// READ THIS BEFORE TRUSTING THE NUMBERS
// -------------------------------------
// Google Trends has no official public API. This uses the same private
// endpoints trends.google.com's own frontend calls:
//
//   1. GET /trends/api/explore          -> returns widgets, each with a token
//   2. GET /trends/api/widgetdata/multiline?token=...  -> the actual series
//
// Both responses are prefixed with ")]}'," junk that must be stripped before
// JSON.parse. Neither is documented, versioned, or promised to anyone.
//
// The failure mode that matters: a COLD request (no cookie) gets a flat HTTP
// 429 from Google, immediately, on the very first call - not after heavy use.
// The fix is to fetch trends.google.com first and reuse the NID cookie it
// sets. That is what warmUp() does, and it is the difference between this
// script working and this script returning nothing. Expect it to break again
// whenever Google changes that handshake.
//
// Because of that, this script is loud about failure and never writes a
// silently-empty day: a geo that 429s is reported and skipped, and the exit
// code is non-zero, so a stale chart is always traceable to a logged failure
// rather than looking like genuine zero interest.
//
// Also note `has_data`: Google returns value 0 with hasData:false for buckets
// below its volume threshold. That is "too small to measure", not "nobody
// searched". Long-tail terms are ALL below it, which is why the Trends
// keyword list is head terms only - see scripts/seo-keywords.mjs.
//
// And `scale_group`: values are normalised 0-100 against the peak of the
// terms fetched together in one request. Comparing a value across groups, or
// against a differently-composed group, is meaningless.
//
// Usage:
//   node scripts/trends-pull.mjs               # all groups
//   node scripts/trends-pull.mjs --dry-run     # fetch + print, write nothing
//   node scripts/trends-pull.mjs --geo ES      # one geo only
//   node scripts/trends-pull.mjs --limit 1     # first N groups
//
// Needs in .env: VITE_DB_URL, DB_SERVICE_KEY. No API key exists
// for this and none can be bought at this tier.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { TRENDS_GROUPS, TIMEFRAME } from './seo-keywords.mjs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const DRY = args.includes('--dry-run');
const ONLY_GEO = flag('--geo');
const LIMIT = Number(flag('--limit', 0)) || 0;

const url = (process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL);
const key = (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY);
if (!DRY && (!url || !key)) {
  console.error('Missing VITE_DB_URL / DB_SERVICE_KEY in .env (or pass --dry-run).');
  process.exit(1);
}
const sb = DRY ? null : createClient(url, key, { auth: { persistSession: false } });

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookie = '';
function absorb(res) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of set) {
    const kv = c.split(';')[0];
    const k = kv.split('=')[0];
    cookie = cookie
      .split('; ')
      .filter(Boolean)
      .filter((x) => x.split('=')[0] !== k)
      .concat(kv)
      .join('; ');
  }
}

// Without this every /api/explore call returns 429 on the first try.
async function warmUp() {
  for (const u of ['https://trends.google.com/', 'https://trends.google.com/trends/explore']) {
    const res = await fetch(u, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(cookie ? { Cookie: cookie } : {}) },
      redirect: 'follow',
    });
    absorb(res);
    await res.text();
    await sleep(500);
  }
  if (!cookie.includes('NID')) {
    console.warn('warm-up did not yield an NID cookie; expect 429s.');
  }
}

const headers = () => ({
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://trends.google.com/trends/explore',
  ...(cookie ? { Cookie: cookie } : {}),
});

// Responses look like ")]}',\n{...}". Strip to the first brace.
function stripPrefix(text) {
  const i = text.indexOf('{');
  if (i < 0) throw new Error('response was not JSON (likely an HTML block page)');
  return text.slice(i);
}

async function getJSON(u, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(u, { headers: headers() });
    absorb(res);
    if (res.status === 429) {
      // Back off hard and re-warm; Google is throttling this IP.
      await sleep(4000 * (attempt + 1));
      await warmUp();
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
    return JSON.parse(stripPrefix(text));
  }
  throw new Error(`${label} rate limited (429) after 3 attempts - IP is being blocked`);
}

async function pullGroup(group) {
  const req = {
    comparisonItem: group.terms.map((keyword) => ({ keyword, geo: group.geo, time: TIMEFRAME })),
    category: 0,
    property: '',
  };
  const exploreUrl =
    'https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=' +
    encodeURIComponent(JSON.stringify(req));
  const widgets = await getJSON(exploreUrl, 'explore');

  const ts = (widgets.widgets || []).find((w) => w.id === 'TIMESERIES');
  if (!ts?.token) throw new Error('no TIMESERIES widget/token in explore response (endpoint changed?)');

  await sleep(1200);
  const dataUrl =
    'https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=' +
    encodeURIComponent(JSON.stringify(ts.request)) +
    '&token=' +
    encodeURIComponent(ts.token);
  const data = await getJSON(dataUrl, 'multiline');

  const timeline = data?.default?.timelineData;
  if (!Array.isArray(timeline) || !timeline.length) throw new Error('empty timeline');

  const rows = [];
  for (const point of timeline) {
    const pointDate = new Date(Number(point.time) * 1000).toISOString().slice(0, 10);
    group.terms.forEach((term, idx) => {
      rows.push({
        term,
        geo: group.geo,
        timeframe: TIMEFRAME,
        point_date: pointDate,
        value: Array.isArray(point.value) ? point.value[idx] ?? null : null,
        has_data: Array.isArray(point.hasData) ? !!point.hasData[idx] : true,
        is_partial: !!point.isPartial,
        scale_group: group.key,
        source: 'trends-unofficial',
      });
    });
  }
  return rows;
}

async function main() {
  let groups = TRENDS_GROUPS;
  if (ONLY_GEO) groups = groups.filter((g) => g.geo === ONLY_GEO.toUpperCase());
  if (LIMIT) groups = groups.slice(0, LIMIT);
  if (!groups.length) {
    console.error(`No groups matched --geo ${ONLY_GEO}.`);
    process.exit(1);
  }

  console.log(`Google Trends - ${groups.length} group(s), ${TIMEFRAME}${DRY ? ' (dry run)' : ''}`);
  await warmUp();

  const allRows = [];
  const failures = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (i > 0) await sleep(3000); // be gentle; this endpoint blocks easily
    try {
      const rows = await pullGroup(g);
      allRows.push(...rows);

      // Print the latest COMPLETE point so the log shows real values.
      const dates = [...new Set(rows.filter((r) => !r.is_partial).map((r) => r.point_date))].sort();
      const latest = dates[dates.length - 1];
      const line = rows
        .filter((r) => r.point_date === latest)
        .map((r) => `${r.term}=${r.has_data ? r.value : 'n/a'}`)
        .join('  ');
      console.log(`  [${g.geo}/${g.key}] ${rows.length} rows, latest ${latest}\n      ${line}`);
    } catch (err) {
      // A geo failing must not lose the others.
      failures.push({ group: `${g.geo}/${g.key}`, error: String(err.message || err) });
      console.log(`  [${g.geo}/${g.key}] FAILED: ${err.message || err}`);
    }
  }

  if (DRY) {
    console.log(`\nDry run: ${allRows.length} rows would be written, ${failures.length} group(s) failed.`);
    if (failures.length) process.exit(1);
    return;
  }

  // Idempotent: PK is (term, geo, timeframe, point_date). Re-running the same
  // day refreshes the trailing partial point instead of duplicating history.
  let written = 0;
  for (let i = 0; i < allRows.length; i += 500) {
    const chunk = allRows.slice(i, i + 500);
    const { error } = await sb
      .from('trends_interest')
      .upsert(chunk, { onConflict: 'term,geo,timeframe,point_date' });
    if (error) {
      console.error(`Upsert failed for chunk ${i / 500}: ${error.message}`);
      failures.push({ group: `chunk ${i / 500}`, error: error.message });
    } else {
      written += chunk.length;
    }
  }

  console.log(`\nWrote ${written}/${allRows.length} rows.`);
  if (failures.length) {
    console.log(`${failures.length} failure(s):`);
    for (const f of failures) console.log(`  ${f.group}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
