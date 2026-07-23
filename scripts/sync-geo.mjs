// Resolve WHERE each ad ran, from Meta's Ad Library DSA transparency data,
// into ads.geo_status / ads.countries / ads.eu_reach (migration 18).
//
// Why this exists: Foreplay gives us no country and no reach. The Ad Library
// does - but only for ads that were served in the EU/UK. So every ad lands in
// exactly one of three buckets, and keeping them apart is the whole point:
//
//   'eu'      Meta returned an EU transparency block. countries + eu_reach filled.
//   'none'    the ad WAS found in the Ad Library but carries no EU block ->
//             it did not run in the EU. A real answer.
//   'unknown' never resolved: no Ad Library match for the row at all (typical
//             for Foreplay-only rows and for US-only ads, which are simply not
//             in the API). NOT an answer - do not read it as "not in the EU".
//
// How rows are matched to Ad Library ads: the library is queried per brand by
// page_id (from `competitors`, migration 15), exactly like import-ad-library.mjs.
// Within a brand, a row matches by metrics.ad_library_id, and failing that by
// exact ad_copy text - the same dedupe key the importer uses. Rows that match
// nothing are left 'unknown' and geo_synced_at is NOT stamped, so they are
// retried on every run (cheap: they ride along with their brand's page query).
//
// Idempotent and safe to re-run: reads are per brand, writes are per row and
// only when a value actually changes.
//
// Usage:  node scripts/sync-geo.mjs                 # everything still 'unknown'
//         node scripts/sync-geo.mjs --dry-run       # print, no writes
//         node scripts/sync-geo.mjs --limit 200     # cap rows resolved this run
//         node scripts/sync-geo.mjs --since 30d     # ALSO re-check rows synced >30d ago
//         node scripts/sync-geo.mjs --brand "Name"  # one competitor
// Needs in .env:  VITE_DB_URL, DB_SERVICE_KEY, META_ACCESS_TOKEN
// (or META_ADLIB_TOKEN). Local only, gitignored - same rules as export.mjs.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// Tiny .env loader (no dotenv dep).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = (process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL);
const serviceKey = (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY);
const metaToken = process.env.META_ADLIB_TOKEN || process.env.META_ACCESS_TOKEN;
if (!url || !serviceKey) {
  console.error('Missing env. Need VITE_DB_URL and DB_SERVICE_KEY in .env.');
  process.exit(1);
}
// No token = nothing this script can do. Say which var, and say it loudly:
// a silent no-op here would look like "every ad is non-EU", which is a lie.
if (!metaToken) {
  console.error(
    'No Meta Ad Library token - cannot resolve geo, nothing written.\n' +
      '\n' +
      'Set META_ACCESS_TOKEN in .env (or META_ADLIB_TOKEN to use a separate\n' +
      'token just for the Ad Library):\n' +
      '\n' +
      '  META_ACCESS_TOKEN=EAAB...\n' +
      '\n' +
      'Get one from developers.facebook.com > your ads app > Graph API Explorer,\n' +
      'on an account whose identity is confirmed at https://facebook.com/ID\n' +
      '(same prerequisite as scripts/import-ad-library.mjs). Then re-run:\n' +
      '  node scripts/sync-geo.mjs --dry-run --limit 20'
  );
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const argOf = (flag) => process.argv.flatMap((a, i) => (a === flag ? [process.argv[i + 1]] : []))[0];
const onlyBrand = argOf('--brand');
const maxRows = Math.max(parseInt(argOf('--limit') || '0', 10) || 0, 0); // 0 = no cap
// --since 30d / 30 -> also re-resolve rows whose geo_synced_at is older than that.
const sinceArg = argOf('--since');
const sinceDays = sinceArg ? parseInt(String(sinceArg).replace(/d$/i, ''), 10) : null;
if (sinceArg && !(sinceDays > 0)) {
  console.error(`--since expects days, e.g. --since 30d (got "${sinceArg}")`);
  process.exit(1);
}
const staleBefore = sinceDays ? new Date(Date.now() - sinceDays * 86400000).toISOString() : null;

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const GRAPH = 'https://graph.facebook.com/v23.0';
const REACHED_COUNTRIES = [
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','GB',
];
// Only the transparency fields - keep the payload small, these queries are the
// expensive ones on the ads_archive rate limit.
const FIELDS = [
  'id',
  'ad_creative_bodies',
  'eu_total_reach',
  'age_country_gender_reach_breakdown',
  'delivery_by_region',
  'target_locations',
  'beneficiary_payers',
].join(',');
const PAGE_SIZE = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same failure modes as import-ad-library.mjs, deliberately identical.
async function graph(params, nextUrl = null) {
  const u = nextUrl ? new URL(nextUrl) : new URL(`${GRAPH}/ads_archive`);
  if (!nextUrl) {
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('access_token', metaToken);
  }
  const res = await fetch(u);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body?.error || {};
    if (err.code === 10 || /identity|confirm/i.test(err.message || '')) {
      console.error(
        'Ad Library access not unlocked yet (verification pending).\n' +
          'Confirm your identity at https://facebook.com/ID on the account that owns\n' +
          'the Meta app (takes 1-3 business days), then re-run. Meta said:\n  ' + (err.message || res.status)
      );
      process.exit(0); // expected state until verification clears - not a cron failure
    }
    if (err.code === 4 || err.code === 613) throw Object.assign(new Error('rate limited'), { rateLimited: true });
    throw new Error(`ads_archive HTTP ${res.status}: ${err.message || JSON.stringify(body).slice(0, 200)}`);
  }
  return { data: body.data || [], next: body.paging?.next || null };
}

// ---------------------------- geo mapping ------------------------------
// target_locations gives country NAMES, not codes; the reach breakdown gives
// codes. Codes are the source of truth, names are the fallback - this map only
// needs the DSA countries because Meta reports nothing outside them.
const NAME_TO_ISO = {
  austria: 'AT', belgium: 'BE', bulgaria: 'BG', croatia: 'HR', cyprus: 'CY',
  czechia: 'CZ', 'czech republic': 'CZ', denmark: 'DK', estonia: 'EE',
  finland: 'FI', france: 'FR', germany: 'DE', greece: 'GR', hungary: 'HU',
  ireland: 'IE', italy: 'IT', latvia: 'LV', lithuania: 'LT', luxembourg: 'LU',
  malta: 'MT', netherlands: 'NL', 'the netherlands': 'NL', poland: 'PL',
  portugal: 'PT', romania: 'RO', slovakia: 'SK', slovenia: 'SI', spain: 'ES',
  sweden: 'SE', 'united kingdom': 'GB', 'great britain': 'GB',
};

// An "EU transparency block" = Meta actually told us about EU delivery.
// eu_total_reach alone can be 0/absent on a genuinely-EU ad, so treat any of
// the three transparency fields as proof.
function euBlock(ad) {
  const reach = Number.isFinite(Number(ad.eu_total_reach)) ? Number(ad.eu_total_reach) : null;
  const breakdown = Array.isArray(ad.age_country_gender_reach_breakdown) ? ad.age_country_gender_reach_breakdown : [];
  const regions = Array.isArray(ad.delivery_by_region) ? ad.delivery_by_region : [];
  const targets = Array.isArray(ad.target_locations) ? ad.target_locations : [];
  const has = reach !== null || breakdown.length > 0 || regions.length > 0;
  if (!has) return null;

  const codes = new Set();
  for (const b of breakdown) {
    const c = String(b?.country || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(c)) codes.add(c);
  }
  if (!codes.size) {
    // No breakdown: fall back to the (included) target locations by name.
    for (const t of targets) {
      if (t?.excluded === true || t?.excluded === 'true') continue;
      const iso = NAME_TO_ISO[String(t?.name || '').trim().toLowerCase()];
      if (iso) codes.add(iso);
    }
  }
  if (!codes.size) {
    // Still nothing nameable, but delivery_by_region proves EU delivery.
    for (const r of regions) {
      const iso = NAME_TO_ISO[String(r?.region || '').trim().toLowerCase()];
      if (iso) codes.add(iso);
    }
  }
  return { eu_reach: reach, countries: [...codes].sort() };
}

const sameCountries = (a, b) =>
  (a || []).length === (b || []).length && (a || []).every((v, i) => v === b[i]);

// ------------------------------- work ----------------------------------
// Rows that need resolving: never resolved, or (with --since) stale.
async function rowsNeedingGeo() {
  const cols = 'id, brand, ad_copy, metrics, geo_status, countries, eu_reach, geo_synced_at';
  const out = [];
  const push = (rows) => {
    for (const r of rows || []) if (!out.some((o) => o.id === r.id)) out.push(r);
  };

  let q = sb.from('ads').select(cols).eq('geo_status', 'unknown').order('created_at', { ascending: false });
  if (onlyBrand) q = q.ilike('brand', onlyBrand);
  const { data: unknowns, error } = await q;
  if (error) {
    console.error(
      `ads read failed: ${error.message}\n` +
        '(if it mentions geo_status, run db-setup.sql in the SQL editor first)'
    );
    process.exit(1);
  }
  push(unknowns);

  if (staleBefore) {
    let sq = sb.from('ads').select(cols).lt('geo_synced_at', staleBefore).order('geo_synced_at', { ascending: true });
    if (onlyBrand) sq = sq.ilike('brand', onlyBrand);
    const { data: stale, error: sErr } = await sq;
    if (sErr) throw new Error(`stale read failed: ${sErr.message}`);
    push(stale);
  }
  return out;
}

const targets = await rowsNeedingGeo();
if (!targets.length) {
  console.log(
    `Nothing to resolve${onlyBrand ? ` for "${onlyBrand}"` : ''}.` +
      (staleBefore ? '' : ' (add --since 30d to also re-check already-synced ads.)')
  );
  process.exit(0);
}

// Brand -> page_id, so we can query the library once per brand instead of
// once per ad. Brands with no page id cannot be looked up at all.
let cq = sb.from('competitors').select('brand, page_id, active');
if (onlyBrand) cq = cq.ilike('brand', onlyBrand);
const { data: competitors, error: compErr } = await cq;
if (compErr) {
  console.error(`competitors read failed: ${compErr.message} (did migration 15 run?)`);
  process.exit(1);
}
const pageIdByBrand = new Map(
  (competitors || []).filter((c) => c.page_id).map((c) => [String(c.brand).toLowerCase(), String(c.page_id)])
);

// Group the work by brand, biggest backlog first.
const byBrand = new Map();
for (const r of targets) {
  const k = String(r.brand || '').toLowerCase();
  if (!byBrand.has(k)) byBrand.set(k, []);
  byBrand.get(k).push(r);
}
const brands = [...byBrand.entries()].sort((a, b) => b[1].length - a[1].length);

const noPageId = brands.filter(([k]) => !pageIdByBrand.has(k));
if (noPageId.length) {
  console.log(
    `Skipping ${noPageId.reduce((n, [, v]) => n + v.length, 0)} ad(s) from ${noPageId.length} brand(s) with no page id ` +
      '(stay "unknown"; paste the page id on /competitors, or run import-ad-library.mjs to resolve it):\n  ' +
      noPageId.map(([, v]) => v[0].brand).join(', ')
  );
}

let resolvedCount = 0; // rows we got an Ad Library answer for, this run
const totals = { eu: 0, none: 0, unmatched: 0, unchanged: 0, written: 0 };

for (const [brandKey, rows] of brands) {
  const pageId = pageIdByBrand.get(brandKey);
  if (!pageId) continue;
  if (maxRows && resolvedCount >= maxRows) break;

  const brandName = rows[0].brand;

  // Index this brand's pending rows by both match keys.
  const byLibId = new Map();
  const byCopy = new Map();
  for (const r of rows) {
    const libId = r.metrics?.ad_library_id;
    if (libId) byLibId.set(String(libId), r);
    else if (r.ad_copy) byCopy.set(r.ad_copy.trim(), r);
  }

  let pages = 0;
  let next = null;
  let brandEu = 0;
  let brandNone = 0;
  try {
    do {
      const res = next
        ? await graph({}, next)
        : await graph({
            search_page_ids: JSON.stringify([pageId]),
            ad_type: 'ALL',
            ad_active_status: 'ALL',
            ad_reached_countries: JSON.stringify(REACHED_COUNTRIES),
            fields: FIELDS,
            limit: String(PAGE_SIZE),
          });
      next = res.next;
      pages++;

      for (const ad of res.data) {
        let row = byLibId.get(String(ad.id));
        if (!row) {
          const copy = (ad.ad_creative_bodies || [])[0];
          if (copy) row = byCopy.get(String(copy).trim());
        }
        if (!row || row.__done) continue;

        const block = euBlock(ad);
        const update = block
          ? { geo_status: 'eu', countries: block.countries, eu_reach: block.eu_reach, geo_synced_at: new Date().toISOString() }
          // Found in the library, no EU transparency -> it did not run in the EU.
          : { geo_status: 'none', countries: [], eu_reach: null, geo_synced_at: new Date().toISOString() };

        row.__done = true;
        resolvedCount++;
        if (block) { brandEu++; totals.eu++; } else { brandNone++; totals.none++; }

        // Idempotence: only write when something actually differs (geo_synced_at
        // alone is not worth a round trip unless we were asked to re-check).
        const changed =
          row.geo_status !== update.geo_status ||
          !sameCountries(row.countries, update.countries) ||
          (row.eu_reach ?? null) !== (update.eu_reach ?? null) ||
          !row.geo_synced_at ||
          Boolean(staleBefore);
        if (!changed) { totals.unchanged++; continue; }

        if (dryRun) {
          console.log(
            `  (dry) ${brandName} ${String(ad.id).slice(0, 18)} -> ${update.geo_status}` +
              (block ? ` ${update.countries.join(',') || '(no country detail)'} reach=${update.eu_reach ?? 'n/a'}` : '')
          );
          totals.written++;
          continue;
        }
        const { error } = await sb.from('ads').update(update).eq('id', row.id);
        if (error) {
          console.error(`  update failed for ad ${row.id}: ${error.message}`);
          continue;
        }
        totals.written++;
      }
      await sleep(1000); // ads_archive rate limits are strict; pace ourselves
    } while (
      next &&
      pages < 40 &&
      rows.some((r) => !r.__done) && // every pending row for this brand answered
      (!maxRows || resolvedCount < maxRows)
    );
  } catch (e) {
    if (e.rateLimited) {
      console.error(`${brandName}: rate limited by Meta, stopping here - re-run later, progress is saved.`);
      break;
    }
    console.error(`${brandName}: ${e.message}`);
    continue;
  }

  const missed = rows.filter((r) => !r.__done).length;
  totals.unmatched += missed;
  console.log(
    `${brandName}: ${brandEu} eu, ${brandNone} none` +
      (missed ? `, ${missed} left unknown (no Ad Library match - likely never ran in the EU/UK, or pre-dates the archive)` : '')
  );
}

console.log(
  `Geo sync${dryRun ? ' (dry run)' : ''}: ${totals.eu} eu, ${totals.none} none, ` +
    `${totals.unmatched} still unknown, ${totals.written} row(s) written` +
    (totals.unchanged ? `, ${totals.unchanged} already current` : '') +
    '.'
);
