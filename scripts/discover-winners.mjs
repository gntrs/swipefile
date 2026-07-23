// Keyword discovery for the Meta Ad Library (ads_archive, Graph v23.0): find
// NEW competitor ads in the kids-speech-development niche that are pulling
// crazy EU reach in a short time, rank them by reach per day, insert them into
// the `ads` table and star them.
//
// This is the keyword sibling of scripts/import-ad-library.mjs. That script
// pulls by page id for brands we already track; this one searches by
// search_terms, so it surfaces brands nobody has added to /competitors yet.
//
// The whole point is the reach-per-day signal: eu_total_reach divided by days
// running. A brand that put 200k EU reach behind an ad in its first week is
// spending hard on something that works, and that is exactly what we want in
// the library while it is still fresh.
//
// Same prerequisites as import-ad-library.mjs: identity verified at
// facebook.com/ID on the Meta account that owns the app, and a token in .env.
//
// Idempotent: each row stores metrics.ad_library_id, which is the dedupe key
// (there is no DB unique constraint, so dedupe is in memory here). Known ads
// are updated in place (reach, days, reach per day, last_synced, starred),
// never duplicated. Writes run sequentially: this is not concurrency safe.
//
// Usage:
//   node scripts/discover-winners.mjs --dry-run            # print, write nothing
//   node scripts/discover-winners.mjs                      # import and star
//   node scripts/discover-winners.mjs --terms="late talker,speech delay"
//   node scripts/discover-winners.mjs --min-reach 25000 --max-age-days 30
//   node scripts/discover-winners.mjs --min-days 5 --limit 20 --star-top=10
//   node scripts/discover-winners.mjs --fixture path.json  # offline, no API
//   node scripts/discover-winners.mjs --help
// Needs in .env:  VITE_DB_URL, DB_SERVICE_KEY, META_ADLIB_TOKEN
// (or META_ACCESS_TOKEN). Local only, gitignored - same rules as export.mjs.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { RECENT_TAG, scoreVerdict } from '../src/lib/ads.js';

// Tiny .env loader (no dotenv dep).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// ------------------------------ args ---------------------------------
const argv = process.argv.slice(2);
// Accepts both idioms the other scripts use: "--limit 40" and "--limit=40".
function argVal(name, fallback) {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  if (i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return fallback;
}
const argNum = (name, fallback) => {
  const raw = argVal(name, null);
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    console.error(`Bad value for ${name}: "${raw}" is not a number.`);
    process.exit(1);
  }
  return n;
};

const HELP = `discover-winners.mjs - keyword discovery for the Meta Ad Library

  --dry-run            do everything including the live API calls, write nothing
  --terms="a,b,c"      override the default kids-speech search terms
  --min-reach N        minimum eu_total_reach (default 10000)
  --max-age-days N     only ads started within this window (default 45)
  --min-days N         skip ads younger than this, reach/day is noise (default 3)
  --limit N            max ads kept after ranking (default 40)
  --star-top N         star only the top N kept ads (default: star all kept)
  --page-size N        Ad Library page size per request (default 100, max 250)
  --fixture PATH       read Ad Library shaped JSON from disk instead of the API
  --help               this text

Env (.env): VITE_DB_URL, DB_SERVICE_KEY, META_ADLIB_TOKEN
(or META_ACCESS_TOKEN).`;

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

const dryRun = argv.includes('--dry-run');
const fixturePath = argVal('--fixture', null);
const MIN_REACH = argNum('--min-reach', 10000);
const MAX_AGE_DAYS = argNum('--max-age-days', 45);
const MIN_DAYS = argNum('--min-days', 3);
const KEEP_LIMIT = argNum('--limit', 40);
const STAR_TOP = argNum('--star-top', null); // null = star everything kept
const pageSize = Math.min(Math.max(argNum('--page-size', 100), 1), 250);

const DEFAULT_TERMS = [
  'speech delay',
  'speech therapy for kids',
  'toddler not talking',
  'late talker',
  'kids speech app',
  'speech development toddler',
  'AAC for kids',
  'help my child talk',
];
const TERMS = String(argVal('--terms', ''))
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);
const SEARCH_TERMS = TERMS.length ? TERMS : DEFAULT_TERMS;

// ------------------------------ env ----------------------------------
const url = (process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL);
const serviceKey = (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY);
const metaToken = process.env.META_ADLIB_TOKEN || process.env.META_ACCESS_TOKEN;

if (!url || !serviceKey) {
  console.error('Missing env. Need VITE_DB_URL and DB_SERVICE_KEY in .env.');
  process.exit(1);
}
// Fixture mode is the offline path (logic check without burning API calls), so
// it is the only case where a missing Meta token is not fatal.
if (!metaToken && !fixturePath) {
  console.error(
    'No Meta Ad Library token. Set META_ADLIB_TOKEN (preferred) or META_ACCESS_TOKEN in .env at the repo root, then re-run.'
  );
  process.exit(1);
}
if (metaToken) {
  console.log(`Token loaded (ends ...${String(metaToken).slice(-4)}).`);
}

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// ------------------------------ api ----------------------------------
const GRAPH = 'https://graph.facebook.com/v23.0';

// All 27 EU member states. UK is deliberately out: this script chases EU reach,
// and eu_total_reach is an EU-only number under the DSA.
const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
];

// Requested fields. Some of these are not returned for every token / every
// query shape, and Meta answers with a 400 naming the offending field rather
// than ignoring it, so FIELDS is mutable: on a 400 we drop the named field,
// say so out loud, and retry once. Silent field loss is the failure mode this
// codebase hates most.
//
// ad_snapshot_url is in here deliberately and is treated as load bearing: it
// is the only per-ad link Meta hands back directly, and it is the fallback
// source for the per-ad permalink when an ad object arrives without an id. It
// is never dropped on a guess, only when Meta names it, and dropping it prints
// a banner rather than a one liner.
const BASE_FIELDS = [
  'id', 'page_name', 'page_id',
  'ad_creative_bodies', 'ad_creative_link_titles', 'ad_creative_link_descriptions', 'ad_creative_link_captions',
  'ad_delivery_start_time', 'ad_delivery_stop_time',
  'ad_snapshot_url', 'publisher_platforms', 'eu_total_reach', 'languages', 'target_locations',
];
let activeFields = [...BASE_FIELDS];
const droppedFields = [];

const SNAPSHOT_FIELD = 'ad_snapshot_url';
let snapshotFieldDropped = false;

// Losing ad_snapshot_url is survivable (the canonical permalink is built from
// the ad id, which is always requested) but it removes the safety net, so it
// gets a banner rather than a line buried in the log.
function warnSnapshotDropped(msg) {
  snapshotFieldDropped = true;
  console.error('');
  console.error('!! '.repeat(20));
  console.error(`!! Meta rejected the ${SNAPSHOT_FIELD} field, so it was dropped for the rest of this run.`);
  console.error('!! Per-ad links now depend entirely on the ad id, and any ad returned without an id');
  console.error('!! will be skipped instead of saved without a link. Meta said:');
  console.error(`!!   ${msg}`);
  console.error('!! '.repeat(20));
  console.error('');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function searchUrl(term, fields) {
  const u = new URL(`${GRAPH}/ads_archive`);
  u.searchParams.set('search_terms', term);
  u.searchParams.set('ad_type', 'ALL');
  u.searchParams.set('ad_active_status', 'ACTIVE');
  u.searchParams.set('ad_reached_countries', JSON.stringify(EU_COUNTRIES));
  u.searchParams.set('fields', fields.join(','));
  u.searchParams.set('limit', String(pageSize));
  u.searchParams.set('access_token', metaToken);
  return u;
}

// One Graph call with every failure mode spelled out. Returns {data, next}.
async function graph(u, { allowFieldRetry = true } = {}) {
  const res = await fetch(u);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body?.error || {};
    const msg = err.message || `HTTP ${res.status}`;
    // code 10 / OAuth "requires identity confirmation" = facebook.com/ID pending.
    if (err.code === 10 || /identity|confirm/i.test(msg)) {
      console.error(
        'Ad Library access not unlocked yet (verification pending).\n' +
          'Confirm your identity at https://facebook.com/ID on the account that owns\n' +
          'the Meta app (takes 1-3 business days), then re-run. Meta said:\n  ' + msg
      );
      process.exit(0); // expected state until verification clears - not a cron failure
    }
    if (err.code === 4 || err.code === 613) {
      throw Object.assign(new Error(`rate limited by Meta: ${msg}`), { rateLimited: true });
    }
    if (res.status === 400 && allowFieldRetry) {
      // Find which requested field Meta objected to and retry once without it.
      // ad_snapshot_url is never part of a blind guess: it is the fallback
      // source for the per-ad permalink, so it only goes when Meta names it,
      // and when it goes the run says so at the top of its lungs.
      const bad = activeFields.filter((f) => f !== 'id' && msg.includes(f));
      const guesses = bad.length ? bad : activeFields.filter((f) => f === 'target_locations');
      if (guesses.length) {
        activeFields = activeFields.filter((f) => !guesses.includes(f));
        droppedFields.push(...guesses);
        console.error(`HTTP 400 from ads_archive: ${msg}`);
        console.error(`  dropped field(s) [${guesses.join(', ')}] and retrying once with the rest.`);
        if (guesses.includes(SNAPSHOT_FIELD)) warnSnapshotDropped(msg);
        const retryUrl = new URL(u);
        retryUrl.searchParams.set('fields', activeFields.join(','));
        return graph(retryUrl, { allowFieldRetry: false });
      }
    }
    throw new Error(`ads_archive HTTP ${res.status}: ${msg}`);
  }
  return { data: body.data || [], next: body.paging?.next || null };
}

// Every ad the API returns for one term, paginated. Never throws: a term that
// fails reports itself and returns what it had, so one bad term cannot kill
// the run.
async function fetchTerm(term) {
  const out = [];
  let next = null;
  let pages = 0;
  do {
    let res;
    try {
      res = await graph(next ? new URL(next) : searchUrl(term, activeFields));
    } catch (e) {
      if (e.rateLimited) {
        console.error(`  "${term}": ${e.message} - stopping this term, keeping ${out.length} ad(s) so far.`);
        throw e; // let the caller decide whether to stop the whole run
      }
      console.error(`  "${term}": ${e.message} - skipping the rest of this term.`);
      return out;
    }
    for (const ad of res.data) out.push({ ...ad, _term: term });
    next = res.next;
    pages++;
    await sleep(1000); // ads_archive rate limits are strict; pace ourselves
  } while (next && pages < 20);
  if (!out.length) console.log(`  "${term}": 0 ads returned by the API.`);
  return out;
}

// ---------------------------- mapping --------------------------------
// Platform casing must match src/pages/AddAd.jsx PLATFORMS.
const PLATFORM_MAP = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  messenger: 'Facebook',
  audience_network: 'Facebook',
  threads: 'Instagram',
};

const DAY_MS = 86400000;

function daysRunning(ad) {
  if (!ad.ad_delivery_start_time) return null;
  const start = new Date(ad.ad_delivery_start_time).getTime();
  if (!Number.isFinite(start)) return null;
  const end = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

const isLive = (ad) =>
  !ad.ad_delivery_stop_time || new Date(ad.ad_delivery_stop_time).getTime() > Date.now();

const firstLine = (s) => (s || '').split('\n').map((l) => l.trim()).find(Boolean) || null;
const truncate = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s);

// Creative angle tagging. These two angles are the ones the team is testing, so
// the tag is what makes the import searchable on /ads later.
const SPEECH_BUBBLE_RE = /speech bubble|kalbos burbul|thought bubble|word bubble|bubble|\u{1F4AC}|\u{1F5E8}|\u{1F5EF}/iu;
const KIDS_RE = /kid|child|toddler|baby|preschool|vaik|son|daughter|little one|my boy|my girl/i;
const ANGLE_SPEECH_BUBBLE = 'angle-speech-bubble';
const ANGLE_KIDS = 'angle-kids';

function creativeText(ad) {
  return [
    ...(ad.ad_creative_bodies || []),
    ...(ad.ad_creative_link_titles || []),
    ...(ad.ad_creative_link_descriptions || []),
    ...(ad.ad_creative_link_captions || []),
  ]
    .filter(Boolean)
    .join('\n');
}

function angleTags(ad) {
  const text = creativeText(ad);
  const tags = [];
  if (SPEECH_BUBBLE_RE.test(text)) tags.push(ANGLE_SPEECH_BUBBLE);
  if (KIDS_RE.test(text)) tags.push(ANGLE_KIDS);
  return tags;
}

// The public Ad Library permalink. Never store ad_snapshot_url verbatim: it
// embeds the access token. Same rule as import-ad-library.mjs.
const permalink = (id) => `https://www.facebook.com/ads/library/?id=${id}`;

// Pull the archive id out of an ad_snapshot_url. Meta returns that field as
// https://www.facebook.com/ads/archive/render_ad/?id=<archive_id>&access_token=...
// so the id is recoverable even when the top level id is missing, and we can
// rebuild the clean canonical link from it without carrying the token along.
function snapshotId(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/[?&]id=(\d+)/);
  return m ? m[1] : null;
}

// One per-ad link, chosen in order of reliability:
//   1. the canonical .../ads/library/?id=<ad_archive_id> built from the ad id.
//      Stable, tokenless, shareable, and the id is always requested.
//   2. the same canonical form rebuilt from the id inside ad_snapshot_url,
//      for the case where Meta returns a snapshot url but no top level id.
// There is deliberately no third option. A page level link is not an ad link,
// so an ad with neither of the above gets skipped rather than half saved.
function adPermalink(ad) {
  if (ad.id != null && String(ad.id).trim()) return permalink(String(ad.id).trim());
  const fromSnapshot = snapshotId(ad.ad_snapshot_url);
  if (fromSnapshot) return permalink(fromSnapshot);
  return null;
}

function mapAd(ad) {
  const platforms = Array.isArray(ad.publisher_platforms) ? ad.publisher_platforms : [];
  const platform = platforms.map((p) => PLATFORM_MAP[String(p).toLowerCase()]).find(Boolean) || 'Facebook';
  const body = (ad.ad_creative_bodies || [])[0] || null;
  const title = (ad.ad_creative_link_titles || [])[0] || null;
  const caption = (ad.ad_creative_link_captions || [])[0] || null; // display URL, e.g. example.com
  const live = isLive(ad);
  const days = daysRunning(ad);
  const reach = Number(ad.eu_total_reach);
  const reachPerDay = Number.isFinite(reach) ? Math.round(reach / Math.max(days || 0, 1)) : 0;
  const angles = angleTags(ad);
  // keepReason() already refused anything without one of these, so by here it
  // is always a real per-ad link.
  const link = adPermalink(ad);
  const archiveId = String(ad.id ?? snapshotId(ad.ad_snapshot_url) ?? '');

  const metrics = {
    source: 'meta-adlibrary-discovery',
    ad_library_id: archiveId,
    // ad_permalink is the one obvious key for the UI to read. source_url holds
    // the same value so older rows and importers keep working.
    ad_permalink: link,
    source_url: link,
    live: true,
    last_synced: new Date().toISOString(),
    search_term: ad._term || null,
    angles,
    starred: false, // set per row after ranking
  };
  if (ad.ad_delivery_start_time) metrics.started_running = new Date(ad.ad_delivery_start_time).toISOString();
  if (days != null) metrics.days_running = days;
  if (Number.isFinite(reach)) {
    metrics.reach = reach;
    metrics.reach_per_day = reachPerDay;
  }
  if (Array.isArray(ad.languages) && ad.languages.length) metrics.languages = ad.languages;

  // Verdict comes from the repo's own scorer (src/lib/ads.js VERDICT_RULES) so
  // this importer cannot invent thresholds. Anything that clears the reach and
  // age filters is live and running, so the floor is 'testing'; only the repo's
  // own winner rule can promote it.
  const scored = scoreVerdict({ metrics, status: 'running' });
  const verdict = scored.verdict === 'winner' ? 'winner' : 'testing';
  metrics.auto_verdict = verdict;

  // landing_url is the advertiser's own destination, nothing else. If the API
  // gave us no display URL we leave it null instead of stuffing the Ad Library
  // link in there: the two mean different things and the Ad Library link
  // already lives in metrics.ad_permalink.
  const landing = caption && /\./.test(caption)
    ? (caption.startsWith('http') ? caption : `https://${caption}`)
    : null;

  return {
    row: {
      brand: (ad.page_name || '').trim() || 'Unknown',
      platform,
      format: 'image', // the API does not expose the creative format; fix by hand if it matters
      media_path: null,
      hook: truncate(firstLine(body) || title, 90),
      ad_copy: body,
      landing_url: landing,
      status: 'running',
      verdict,
      tags: [RECENT_TAG, ...angles],
      metrics,
      added_by_email: 'adlib@import',
    },
    reach: Number.isFinite(reach) ? reach : 0,
    days: days ?? 0,
    reachPerDay,
    term: ad._term || null,
    angles,
    verdictReason: scored.reason,
  };
}

// ---------------------------- filtering ------------------------------
function keepReason(ad) {
  const days = daysRunning(ad);
  const reach = Number(ad.eu_total_reach);
  // An ad we cannot link straight back to is not useful, so this check comes
  // before everything else.
  if (!adPermalink(ad)) return 'no per-ad permalink (no id and no usable ad_snapshot_url)';
  if (!Number.isFinite(reach)) return 'no eu_total_reach returned';
  if (reach < MIN_REACH) return `reach ${reach} below --min-reach ${MIN_REACH}`;
  if (days == null) return 'no ad_delivery_start_time';
  if (days > MAX_AGE_DAYS) return `started ${days}d ago, older than --max-age-days ${MAX_AGE_DAYS}`;
  if (days < MIN_DAYS) return `only ${days}d old, below --min-days ${MIN_DAYS}`;
  return null;
}

// ------------------------------ run ----------------------------------
console.log(
  `Discovery run: ${SEARCH_TERMS.length} term(s), min reach ${MIN_REACH}, age <= ${MAX_AGE_DAYS}d, ` +
    `age >= ${MIN_DAYS}d, keep ${KEEP_LIMIT}${dryRun ? ' [DRY RUN, nothing is written]' : ''}`
);

let raw = [];
if (fixturePath) {
  // Offline path: a JSON array of Ad Library shaped objects. Used to prove the
  // ranking, tagging and insert shape without a token.
  const abs = path.resolve(process.cwd(), fixturePath);
  if (!fs.existsSync(abs)) {
    console.error(`Fixture not found: ${abs}`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    console.error(`Fixture is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(parsed)) {
    console.error('Fixture must be a JSON array of Ad Library ad objects.');
    process.exit(1);
  }
  raw = parsed.map((ad, i) => ({ ...ad, _term: ad._term || SEARCH_TERMS[i % SEARCH_TERMS.length] }));
  console.log(`Fixture mode: ${raw.length} ad(s) read from ${abs} (no API calls made).`);
} else {
  for (const term of SEARCH_TERMS) {
    try {
      const got = await fetchTerm(term);
      console.log(`  "${term}": ${got.length} ad(s)`);
      raw.push(...got);
    } catch (e) {
      if (e.rateLimited) {
        console.error('Rate limited by Meta, stopping the search here - the rest gets picked up on the next run.');
        break;
      }
      console.error(`  "${term}": ${e.message}`);
    }
  }
}
if (droppedFields.length) {
  console.error(`Fields dropped this run after a 400: ${[...new Set(droppedFields)].join(', ')}`);
}

// Same ad can surface under several terms. First term to find it wins.
const byId = new Map();
let dupeAcrossTerms = 0;
let unlinkable = 0;
for (const ad of raw) {
  // Key on the per-ad permalink so an ad with no id but a usable snapshot url
  // still dedupes correctly. Ads with neither are kept in the map under a
  // throwaway key so keepReason() can count them in the skip summary instead
  // of them vanishing here without a trace.
  const key = adPermalink(ad) || `__unlinkable_${unlinkable++}`;
  if (byId.has(key)) { dupeAcrossTerms++; continue; }
  byId.set(key, ad);
}

const skipCounts = new Map();
const kept = [];
for (const ad of byId.values()) {
  const reason = keepReason(ad);
  if (reason) {
    const bucket = reason.replace(/\d+/g, 'N');
    skipCounts.set(bucket, (skipCounts.get(bucket) || 0) + 1);
    continue;
  }
  kept.push(mapAd(ad));
}

// The signal: crazy reach in a short period.
kept.sort((a, b) => b.reachPerDay - a.reachPerDay);
const overflow = Math.max(0, kept.length - KEEP_LIMIT);
const finalists = kept.slice(0, KEEP_LIMIT);

// Starring. Default is "star everything this run imports", which is the ask;
// --star-top N narrows it to the top N by reach per day.
const starCut = STAR_TOP == null ? finalists.length : Math.max(0, Math.min(STAR_TOP, finalists.length));
finalists.forEach((f, i) => { f.row.metrics.starred = i < starCut; });

// ---------------------------- ranked table ---------------------------
const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
const padNum = (s, n) => String(s ?? '').padStart(n);
console.log('');
console.log(
  `${pad('#', 3)} ${pad('BRAND', 24)} ${padNum('REACH', 9)} ${padNum('DAYS', 5)} ${padNum('REACH/DAY', 10)} ${pad('ANGLES', 22)} ${pad('VERDICT', 8)} ${pad('STAR', 5)} AD LINK`
);
console.log('-'.repeat(140));
finalists.forEach((f, i) => {
  console.log(
    `${pad(i + 1, 3)} ${pad(f.row.brand, 24)} ${padNum(f.reach, 9)} ${padNum(f.days, 5)} ${padNum(f.reachPerDay, 10)} ` +
      `${pad(f.angles.map((a) => a.replace('angle-', '')).join(',') || '-', 22)} ${pad(f.row.verdict, 8)} ` +
      `${pad(f.row.metrics.starred ? 'yes' : 'no', 5)} ${f.row.metrics.ad_permalink}`
  );
});
if (!finalists.length) console.log('(nothing cleared the filters)');
console.log('');

// In a dry run, show the exact row that would hit the `ads` table so the shape
// can be eyeballed before anything is written.
if (dryRun && finalists.length) {
  console.log('Sample insert payload (rank 1):');
  console.log(JSON.stringify(finalists[0].row, null, 2));
  console.log(`  ad_permalink: ${finalists[0].row.metrics.ad_permalink}`);
  console.log(`  source_url:   ${finalists[0].row.metrics.source_url}`);
  console.log(`  landing_url:  ${finalists[0].row.landing_url ?? 'null (no advertiser destination in the API response)'}`);
  console.log('');
}

// ------------------------------ dedupe -------------------------------
// No unique constraint exists on `ads`, so dedupe is in memory: key on
// metrics.ad_library_id, fall back to exact ad_copy text. Sequential by
// design - two copies of this script running at once WILL double insert.
const { data: existing, error: readErr } = await sb
  .from('ads')
  .select('id, brand, ad_copy, verdict, tags, metrics')
  .or('metrics->>source.eq.meta-adlibrary-discovery,metrics->>source.eq.meta-adlibrary,metrics->>ad_library_id.not.is.null');
if (readErr) {
  console.error(`Could not read existing ads for dedupe: ${readErr.message}`);
  process.exit(1);
}
const byLibId = new Map();
const byCopy = new Map();
for (const row of existing || []) {
  const libId = row.metrics?.ad_library_id;
  if (libId) byLibId.set(String(libId), row);
  if (row.ad_copy) byCopy.set(row.ad_copy.trim(), row);
}
console.log(`Dedupe index: ${byLibId.size} row(s) with an ad_library_id, ${byCopy.size} distinct copy text(s).`);

let inserted = 0;
let updated = 0;
let starred = 0;
let failed = 0;

for (const f of finalists) {
  const libId = f.row.metrics.ad_library_id;
  const old = byLibId.get(libId) || (f.row.ad_copy ? byCopy.get(f.row.ad_copy.trim()) : null);

  if (!old) {
    if (dryRun) {
      console.log(`  WOULD INSERT ${f.row.brand}: ${(f.row.hook || f.row.ad_copy || libId).slice(0, 60)}`);
      inserted++;
      if (f.row.metrics.starred) starred++;
      continue;
    }
    const { error } = await sb.from('ads').insert(f.row);
    if (error) {
      console.error(`  insert failed for ${libId}: ${error.message}`);
      failed++;
      continue;
    }
    byLibId.set(libId, { id: null, metrics: f.row.metrics });
    if (f.row.ad_copy) byCopy.set(f.row.ad_copy.trim(), { id: null });
    inserted++;
    if (f.row.metrics.starred) starred++;
    console.log(`  + ${f.row.brand}: ${(f.row.hook || f.row.ad_copy || libId).slice(0, 60)} (${f.reachPerDay}/day)`);
    continue;
  }

  // Known ad: refresh the numbers only. Content fields and any human verdict
  // are left exactly as they are.
  const oldM = old.metrics || {};
  const metrics = {
    ...oldM,
    ad_library_id: oldM.ad_library_id || libId,
    reach: f.row.metrics.reach,
    days_running: f.row.metrics.days_running,
    reach_per_day: f.row.metrics.reach_per_day,
    last_synced: f.row.metrics.last_synced,
    starred: f.row.metrics.starred || Boolean(oldM.starred),
    live: true,
  };
  if (dryRun) {
    console.log(`  WOULD UPDATE ${f.row.brand} (${libId}): reach ${oldM.reach ?? '-'} -> ${metrics.reach}, starred ${metrics.starred}`);
    updated++;
    if (metrics.starred && !oldM.starred) starred++;
    continue;
  }
  const { error } = await sb.from('ads').update({ metrics }).eq('id', old.id);
  if (error) {
    console.error(`  update failed for ${libId}: ${error.message}`);
    failed++;
    continue;
  }
  updated++;
  if (metrics.starred && !oldM.starred) starred++;
}

// ------------------------------ summary ------------------------------
console.log('');
if (skipCounts.size) {
  console.log('Skipped:');
  for (const [reason, n] of [...skipCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n} x ${reason}`);
  }
}
if (dupeAcrossTerms) console.log(`  ${dupeAcrossTerms} x same ad returned by more than one search term`);
if (snapshotFieldDropped) {
  console.log(`  note: ${SNAPSHOT_FIELD} was rejected by Meta this run, so links came from the ad id alone.`);
}
if (overflow) console.log(`  ${overflow} x ranked below --limit ${KEEP_LIMIT}`);
if (failed) console.log(`  ${failed} x write failed (see errors above)`);
console.log(
  `kept ${finalists.length} / fetched ${byId.size}, inserted ${inserted}, updated ${updated}, starred ${starred}` +
    (dryRun ? ' [DRY RUN, nothing written]' : '')
);
