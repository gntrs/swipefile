// Import competitor ads straight from the Meta Ad Library API (ads_archive,
// Graph v23.0) into the `ads` table. This replaces the Foreplay
// Spyder import: same table, same refresh semantics, no subscription.
//
// What the API gives us: every ad that reached EU/UK users in the past year
// (DSA transparency), for any page, with creative text, delivery dates and
// EU reach. US-only ads are NOT in the API - accepted limitation. Creatives
// (the actual image/video) are not downloadable in v1: rows carry the public
// Ad Library permalink in metrics.source_url instead.
//
// One-time setup (the only prerequisite):
//   1. Verify your identity at facebook.com/ID on the Meta account that owns
//      the ads app (same account as the Marketing API token). Takes 1-3
//      business days. Until it clears, this script exits with a clear
//      "verification pending" message - safe on the cron.
//   2. Token: reuses META_ACCESS_TOKEN from .env; set META_ADLIB_TOKEN to
//      override with a different token if needed.
//
// Which brands: the `competitors` table (migration 15). On every run the
// script first SEEDS it with any brand that has Foreplay Spyder rows in
// `ads` but no competitors row yet, then RESOLVES missing page_ids by
// searching the Ad Library for the brand name (only auto-saves when exactly
// one page matches). Brands it cannot resolve are listed for a human: paste
// the page id or the brand's Ad Library link on /competitors.
//
// Idempotent: each row stores metrics.ad_library_id. New ads are inserted,
// known ads are REFRESHED (live flag, days running, status, auto verdict -
// identical rules to import-foreplay.mjs, human verdicts never overwritten).
// A new ad whose copy text already exists for the same brand is skipped, so
// old Foreplay rows do not get duplicated.
//
// Usage:  node scripts/import-ad-library.mjs                # all active competitors
//         node scripts/import-ad-library.mjs --dry-run      # print, no writes
//         node scripts/import-ad-library.mjs --brand "Name" # one competitor
//         node scripts/import-ad-library.mjs --limit 50     # page size (default 100)
// Needs in .env:  VITE_DB_URL, DB_SERVICE_KEY, META_ACCESS_TOKEN
// (or META_ADLIB_TOKEN). All local only, gitignored - same rules as export.mjs.
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
// Optional: your own brand name, so it never gets seeded as a "competitor".
const OWN_BRAND = (process.env.OWN_BRAND || '').trim().toLowerCase();
if (!url || !serviceKey) {
  console.error('Missing env. Need VITE_DB_URL and DB_SERVICE_KEY in .env.');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const onlyBrand = process.argv.flatMap((a, i) => (a === '--brand' ? [process.argv[i + 1]] : []))[0];
const limitArg = process.argv.flatMap((a, i) => (a === '--limit' ? [process.argv[i + 1]] : []))[0];
const pageSize = Math.min(Math.max(parseInt(limitArg || '100', 10) || 100, 1), 250);

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const GRAPH = 'https://graph.facebook.com/v23.0';
// All ads that reached any of these countries are in the library (DSA/UK).
const REACHED_COUNTRIES = [
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','GB',
];
const FIELDS = [
  'id', 'page_id', 'page_name',
  'ad_creative_bodies', 'ad_creative_link_titles', 'ad_creative_link_captions', 'ad_creative_link_descriptions',
  'ad_delivery_start_time', 'ad_delivery_stop_time',
  'publisher_platforms', 'languages', 'eu_total_reach', 'target_ages', 'target_gender',
].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One Graph call with the failure modes spelled out. Returns {data, paging}.
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
    // code 10 / OAuth "requires identity confirmation" = facebook.com/ID pending.
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

// -------------------------- mapping ---------------------------------
// Platform casing must match src/pages/AddAd.jsx PLATFORMS.
const PLATFORM_MAP = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  messenger: 'Facebook',
  audience_network: 'Facebook',
  threads: 'Instagram',
};

function daysRunning(ad) {
  if (!ad.ad_delivery_start_time) return null;
  const start = new Date(ad.ad_delivery_start_time).getTime();
  const end = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 86400000));
}

const isLive = (ad) =>
  !ad.ad_delivery_stop_time || new Date(ad.ad_delivery_stop_time).getTime() > Date.now();

// Competitor activity IS the signal (same rules as import-foreplay.mjs):
// nobody pays for a losing ad for a month.
const WINNER_MIN_DAYS = 30;
const LOSER_MAX_DAYS = 14;
function autoVerdict(live, days) {
  if (days == null) return null;
  if (days >= WINNER_MIN_DAYS) return 'winner';
  if (live) return 'testing';
  if (days < LOSER_MAX_DAYS) return 'loser';
  return 'unsure';
}

const firstLine = (s) => (s || '').split('\n').map((l) => l.trim()).find(Boolean) || null;

function mapAd(ad, brand) {
  const platforms = Array.isArray(ad.publisher_platforms) ? ad.publisher_platforms : [];
  const platform = platforms.map((p) => PLATFORM_MAP[String(p).toLowerCase()]).find(Boolean) || 'Facebook';
  const body = (ad.ad_creative_bodies || [])[0] || null;
  const title = (ad.ad_creative_link_titles || [])[0] || null;
  const caption = (ad.ad_creative_link_captions || [])[0] || null; // display URL, e.g. example.com
  const live = isLive(ad);
  const days = daysRunning(ad);

  const metrics = {
    source: 'meta-adlibrary',
    ad_library_id: String(ad.id),
    // Tokenless public permalink - never store ad_snapshot_url, it embeds the token.
    source_url: `https://www.facebook.com/ads/library/?id=${ad.id}`,
    live,
    last_synced: new Date().toISOString(),
  };
  if (ad.ad_delivery_start_time) metrics.started_running = new Date(ad.ad_delivery_start_time).toISOString();
  if (days != null) metrics.days_running = days;
  // reach: the /ads "Most impressions" sort already falls back to metrics.reach.
  if (ad.eu_total_reach != null) metrics.reach = Number(ad.eu_total_reach) || undefined;
  if (Array.isArray(ad.languages) && ad.languages.length) metrics.languages = ad.languages;
  if (Array.isArray(ad.target_ages) && ad.target_ages.length) metrics.target_ages = ad.target_ages;
  if (ad.target_gender && ad.target_gender !== 'All') metrics.target_gender = ad.target_gender;

  const verdict = autoVerdict(live, days);
  if (verdict) metrics.auto_verdict = verdict;

  return {
    brand,
    platform,
    format: 'image', // the API does not expose the creative format; fix by hand if it matters
    hook: title || firstLine(body),
    ad_copy: body,
    landing_url: caption && /\./.test(caption) ? (caption.startsWith('http') ? caption : `https://${caption}`) : null,
    status: live ? 'running' : 'dead',
    verdict: verdict || 'unsure',
    tags: [],
    metrics,
    added_by_email: 'adlib@import',
  };
}

// --------------------------- competitors -----------------------------
// Seed: every brand with Foreplay Spyder rows in `ads` gets a competitors row
// (page_id null until resolved). Runs every time, no-op when nothing is new.
async function seedCompetitors() {
  const { data: spyderAds, error } = await sb
    .from('ads')
    .select('brand')
    .eq('metrics->>source', 'foreplay-spyder');
  if (error) throw new Error(`seed read failed: ${error.message}`);
  const brands = [...new Set((spyderAds || []).map((r) => (r.brand || '').trim()).filter(Boolean))]
    .filter((b) => !OWN_BRAND || b.toLowerCase() !== OWN_BRAND);
  if (!brands.length) return;
  const { data: existing, error: exErr } = await sb.from('competitors').select('brand');
  if (exErr) throw new Error(`competitors read failed: ${exErr.message} (did migration 15 run?)`);
  const known = new Set((existing || []).map((r) => r.brand.trim().toLowerCase()));
  const fresh = brands.filter((b) => !known.has(b.toLowerCase()));
  if (!fresh.length) return;
  if (dryRun) {
    console.log(`(dry run) would seed ${fresh.length} competitors: ${fresh.join(', ')}`);
    return;
  }
  const { error: insErr } = await sb.from('competitors').insert(
    fresh.map((brand) => ({ brand, notes: 'seeded from Foreplay Spyder', added_by_email: 'adlib@import' }))
  );
  if (insErr) throw new Error(`seed insert failed: ${insErr.message}`);
  console.log(`Seeded ${fresh.length} competitors from Foreplay Spyder brands: ${fresh.join(', ')}`);
}

// Resolve a brand name -> Meta page_id via an Ad Library search. Only trust
// the result when every matching page_name agrees on a single page_id.
async function resolvePageId(brand) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const { data } = await graph({
    search_terms: brand,
    ad_type: 'ALL',
    ad_active_status: 'ALL',
    ad_reached_countries: JSON.stringify(REACHED_COUNTRIES),
    fields: 'page_id,page_name',
    limit: '100',
  });
  const ids = new Set(
    data.filter((a) => norm(a.page_name || '') === norm(brand)).map((a) => String(a.page_id))
  );
  if (ids.size === 1) return [...ids][0];
  return { candidates: [...new Set(data.map((a) => `${a.page_name} (${a.page_id})`))].slice(0, 8) };
}

// ----------------------------- import --------------------------------
async function importBrand(comp) {
  // Everything already imported for this dedupe key, plus existing copy text
  // per brand so Foreplay-era rows are not duplicated.
  const { data: existing, error: exErr } = await sb
    .from('ads')
    .select('id, verdict, ad_copy, metrics')
    .eq('brand', comp.brand);
  if (exErr) throw new Error(`dedupe query (${comp.brand}): ${exErr.message}`);
  const byLibId = new Map();
  const knownCopy = new Set();
  for (const r of existing || []) {
    if (r.metrics?.ad_library_id) byLibId.set(String(r.metrics.ad_library_id), r);
    else if (r.ad_copy) knownCopy.add(r.ad_copy.trim());
  }

  let inserted = 0;
  let refreshed = 0;
  let skipped = 0;
  let next = null;
  let pages = 0;
  do {
    const res = next
      ? await graph({}, next)
      : await graph({
          search_page_ids: JSON.stringify([comp.page_id]),
          ad_type: 'ALL',
          ad_active_status: 'ALL',
          ad_reached_countries: JSON.stringify(REACHED_COUNTRIES),
          fields: FIELDS,
          limit: String(pageSize),
        });
    next = res.next;
    pages++;

    for (const ad of res.data) {
      const old = byLibId.get(String(ad.id));
      const mapped = mapAd(ad, comp.brand);

      if (!old) {
        // Same copy already in the library (Foreplay import)? Skip, no dupe.
        if (mapped.ad_copy && knownCopy.has(mapped.ad_copy.trim())) {
          skipped++;
          continue;
        }
        if (dryRun) {
          console.log(JSON.stringify(mapped, null, 2));
          inserted++;
          continue;
        }
        const { error } = await sb.from('ads').insert(mapped);
        if (error) {
          console.error(`  insert failed for ${ad.id}: ${error.message}`);
          continue;
        }
        if (mapped.ad_copy) knownCopy.add(mapped.ad_copy.trim());
        inserted++;
        console.log(`  + ${comp.brand}: ${(mapped.hook || mapped.ad_copy || ad.id).slice(0, 70)}${mapped.verdict !== 'unsure' ? ` (auto: ${mapped.verdict})` : ''}`);
        continue;
      }

      // Refresh: live flag, days, status, auto verdict. Content fields are
      // left alone - the team may have edited them. (Same rules as Foreplay.)
      if (dryRun) {
        refreshed++;
        continue;
      }
      const oldM = old.metrics || {};
      const metrics = { ...oldM, ...mapped.metrics, source: oldM.source || mapped.metrics.source };
      const update = { metrics, status: mapped.status };
      const lastAuto = oldM.auto_verdict || 'unsure';
      const newAuto = autoVerdict(mapped.metrics.live, mapped.metrics.days_running ?? null);
      if (newAuto && old.verdict === lastAuto) {
        update.verdict = newAuto;
        metrics.auto_verdict = newAuto;
      } else {
        metrics.auto_verdict = oldM.auto_verdict;
        if (metrics.auto_verdict == null) delete metrics.auto_verdict;
      }
      const { error } = await sb.from('ads').update(update).eq('id', old.id);
      if (error) {
        console.error(`  refresh failed for ${ad.id}: ${error.message}`);
        continue;
      }
      refreshed++;
    }
    await sleep(1000); // ads_archive rate limits are strict; pace ourselves
  } while (next && pages < 40);

  return { inserted, refreshed, skipped };
}

// ------------------------------ run ----------------------------------
await seedCompetitors();

if (!metaToken) {
  console.error(
    'No META_ACCESS_TOKEN (or META_ADLIB_TOKEN) in .env - competitors seeded, ads not pulled.\n' +
      'On this machine, copy META_ACCESS_TOKEN from the WSL clone .env to run the pull here.'
  );
  process.exit(0);
}

let q = sb.from('competitors').select('*').eq('active', true).order('brand');
if (onlyBrand) q = q.ilike('brand', onlyBrand);
const { data: competitors, error: compErr } = await q;
if (compErr) {
  console.error(`competitors read failed: ${compErr.message} (did migration 15 run in the SQL editor?)`);
  process.exit(1);
}
if (!competitors?.length) {
  console.log(onlyBrand ? `No active competitor matching "${onlyBrand}".` : 'No active competitors to scrape. Add some on /competitors.');
  process.exit(0);
}

// Resolve missing page ids first, so a brand added by name alone starts
// working without anyone hunting for the page id.
const unresolved = [];
for (const comp of competitors.filter((c) => !c.page_id)) {
  try {
    const r = await resolvePageId(comp.brand);
    if (typeof r === 'string') {
      comp.page_id = r;
      if (!dryRun) await sb.from('competitors').update({ page_id: r }).eq('id', comp.id);
      console.log(`Resolved page id for ${comp.brand}: ${r}`);
    } else {
      unresolved.push(`${comp.brand}${r.candidates.length ? ` - candidates: ${r.candidates.join(', ')}` : ' - no Ad Library match'}`);
    }
  } catch (e) {
    if (e.rateLimited) { unresolved.push(`${comp.brand} - rate limited, next run`); continue; }
    throw e;
  }
  await sleep(1000);
}
if (unresolved.length) {
  console.log(`Could not resolve ${unresolved.length} page id(s) - paste the page id or Ad Library link on /competitors:\n  ${unresolved.join('\n  ')}`);
}

let totals = { inserted: 0, refreshed: 0, skipped: 0 };
for (const comp of competitors.filter((c) => c.page_id)) {
  try {
    const r = await importBrand(comp);
    totals.inserted += r.inserted;
    totals.refreshed += r.refreshed;
    totals.skipped += r.skipped;
    console.log(`${comp.brand}: ${r.inserted} new, ${r.refreshed} refreshed${r.skipped ? `, ${r.skipped} skipped (copy already in library)` : ''}`);
    if (!dryRun) await sb.from('competitors').update({ last_scraped_at: new Date().toISOString() }).eq('id', comp.id);
  } catch (e) {
    if (e.rateLimited) {
      console.error(`${comp.brand}: rate limited by Meta, stopping here - the daily cron picks the rest up tomorrow.`);
      break;
    }
    console.error(`${comp.brand}: ${e.message}`);
  }
}

console.log(
  `Ad Library import${dryRun ? ' (dry run)' : ''}: ${totals.inserted} new, ${totals.refreshed} refreshed, ${totals.skipped} skipped.`
);
