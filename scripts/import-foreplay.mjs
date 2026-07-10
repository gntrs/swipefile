// Import saved ads from Foreplay (swipe file) into the Supabase `ads` table,
// so the team's ad library auto-fills with everything saved in Foreplay.
//
// API: https://public.api.foreplay.co (docs: /docs, spec: /openapi.json)
//   GET /api/swipefile/ads   - the user's saved ads (Bearer auth, offset/limit)
// Works on the free tier (10k API credits/month as of 2026-07).
//
// Idempotent: each row stores metrics.foreplay_id. New ads are inserted,
// already-imported ads are REFRESHED (live flag, days running, status and the
// auto verdict below), so re-running on a cron keeps competitor activity fresh.
//
// Auto verdict (competitor ads only - a brand keeps paying for what works):
//   ran 30+ days               -> winner
//   still live, under 30 days  -> testing
//   killed in under 14 days    -> loser
//   dead after 14-29 days      -> unsure
// The script remembers what it set (metrics.auto_verdict) and never overwrites
// a verdict a human changed by hand. Rows matching your own brand (OWN_BRAND
// in .env) are skipped - auto-verdicts are for competitor ads only.
//
// Media: the ad's video/image is downloaded from Foreplay's CDN and uploaded
// to the private `ad-media` bucket under imports/foreplay/<id>.<ext>. If the
// download fails, the row is still inserted with media_path null.
//
// Usage:  node scripts/import-foreplay.mjs                  # swipe file + spyder brands
//         node scripts/import-foreplay.mjs --limit 100      # page size (default 250 = max)
//         node scripts/import-foreplay.mjs --dry-run        # show what would be inserted
//         node scripts/import-foreplay.mjs --spyder-only    # only tracked competitor brands
//         node scripts/import-foreplay.mjs --swipefile-only # only hand-saved ads
// Needs in .env:  VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY, FOREPLAY_API_KEY
// (all local only, gitignored - same rules as scripts/export.mjs).
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

// Your own brand name (see import-meta-ads.mjs) - those rows keep human verdicts.
const OUR_BRAND = process.env.OWN_BRAND || 'My Brand';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const foreplayKey = process.env.FOREPLAY_API_KEY;
if (!url || !serviceKey || !foreplayKey) {
  console.error(
    'Missing env. Need VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY and FOREPLAY_API_KEY in .env.\n' +
      'Foreplay key: https://app.foreplay.co/api-overview (copy icon).\n' +
      'All three stay local (gitignored). NEVER in frontend code or Vercel.'
  );
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.flatMap((a, i) => (a === '--limit' ? [process.argv[i + 1]] : []))[0];
// Max page size by default: pagination walks everything anyway, and bigger
// pages mean fewer requests against the monthly credit budget.
const limit = Math.min(Math.max(parseInt(limitArg || '250', 10) || 250, 1), 250);

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const FOREPLAY = 'https://public.api.foreplay.co';

async function foreplay(pathname, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${FOREPLAY}${pathname}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${foreplayKey}` },
  });
  if (res.status === 401 || res.status === 403) {
    console.error(
      'Foreplay rejected the API key (HTTP ' + res.status + ').\n' +
        'Check FOREPLAY_API_KEY in .env, or your plan at https://app.foreplay.co/api-overview\n' +
        '(the API is available on all current plans, but not on legacy plans).'
    );
    process.exit(1);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.metadata?.success === false) {
    throw new Error(`Foreplay ${pathname}: HTTP ${res.status} ${JSON.stringify(body?.error || body?.metadata || '')}`);
  }
  return body.data || [];
}

// -------------------------- mapping ---------------------------------
// Platform casing must match src/pages/AddAd.jsx PLATFORMS.
const PLATFORM_MAP = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

// How long an ad has been running, in whole days. Foreplay sends
// running_duration as {seconds, minutes, hours, days}; fall back to
// started_running for live ads if it is missing.
function daysRunning(ad) {
  const d = ad.running_duration?.days;
  if (typeof d === 'number') return d;
  if (ad.live && ad.started_running) {
    return Math.max(0, Math.floor((Date.now() - new Date(ad.started_running).getTime()) / 86400000));
  }
  return null;
}

// Competitor activity IS the signal: nobody pays for a losing ad for a month.
const WINNER_MIN_DAYS = 30;
const LOSER_MAX_DAYS = 14;

function autoVerdict(live, days) {
  if (days == null) return null;
  if (days >= WINNER_MIN_DAYS) return 'winner';
  if (live) return 'testing';
  if (days < LOSER_MAX_DAYS) return 'loser';
  return 'unsure';
}

function mapAd(ad) {
  const platforms = Array.isArray(ad.publisher_platform) ? ad.publisher_platform : [];
  const platform = platforms.map((p) => PLATFORM_MAP[String(p).toLowerCase()]).find(Boolean) || 'Other';
  const fmt = String(ad.display_format || ad.type || '').toLowerCase();
  const format = fmt.includes('video') || fmt.includes('reel') ? 'video' : 'image';
  const tags = [...new Set((ad.niches || []).map((n) => String(n).toLowerCase().trim()).filter(Boolean))];

  const metrics = { source: 'foreplay', foreplay_id: ad.id, last_synced: new Date().toISOString() };
  if (ad.ad_id) metrics.foreplay_ad_id = ad.ad_id;
  if (ad.foreplay_url) metrics.foreplay_url = ad.foreplay_url;
  if (typeof ad.live === 'boolean') metrics.live = ad.live;
  if (ad.started_running) metrics.started_running = new Date(ad.started_running).toISOString();
  const days = daysRunning(ad);
  if (days != null) metrics.days_running = days;
  if (ad.cta_type) metrics.cta_type = ad.cta_type;
  if (ad.video_duration) metrics.video_duration = ad.video_duration;
  // Extra context Foreplay gives away with every ad - gold for analysis.
  if (ad.full_transcription) metrics.transcription = ad.full_transcription;
  if (Array.isArray(ad.emotional_drivers) && ad.emotional_drivers.length) metrics.emotional_drivers = ad.emotional_drivers;
  if (Array.isArray(ad.market_target) && ad.market_target.length) metrics.market_target = ad.market_target;
  if (Array.isArray(ad.languages) && ad.languages.length) metrics.languages = ad.languages;

  const verdict = ad.name === OUR_BRAND ? null : autoVerdict(ad.live, days);
  if (verdict) metrics.auto_verdict = verdict;

  return {
    brand: ad.name || null,
    platform,
    format,
    hook: ad.headline || null,
    ad_copy: ad.description || null,
    landing_url: ad.link_url || null,
    status: typeof ad.live === 'boolean' ? (ad.live ? 'running' : 'dead') : 'saved',
    verdict: verdict || 'unsure',
    tags,
    metrics,
    added_by_email: 'foreplay@import', // added_by (uuid) is nullable - omitted
  };
}

// --------------------------- media ----------------------------------
const EXT_BY_TYPE = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

async function uploadMedia(ad, format) {
  const src = (format === 'video' ? ad.video : null) || ad.image || ad.thumbnail;
  if (!src) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    const ext =
      EXT_BY_TYPE[type] ||
      (src.split('?')[0].match(/\.(mp4|mov|webm|jpe?g|png|webp|gif)$/i)?.[1] || '').toLowerCase() ||
      (format === 'video' ? 'mp4' : 'jpg');
    const bytes = Buffer.from(await res.arrayBuffer());
    const storagePath = `imports/foreplay/${ad.id}.${ext === 'jpeg' ? 'jpg' : ext}`;
    const { error } = await sb.storage.from('ad-media').upload(storagePath, bytes, {
      contentType: type || undefined,
      upsert: true,
    });
    if (error) throw error;
    return storagePath;
  } catch (err) {
    console.warn(`  media skipped for ${ad.id}: ${err.message}`);
    return null;
  }
}

// ---------------------------- run -----------------------------------
// Two sources, both on by default (cron runs both):
//   swipe file: ads the team saved by hand in Foreplay
//   spyder: every ad from the competitor brands tracked in Foreplay Spyder
// Spyder rows carry metrics.source 'foreplay-spyder' and get status
// running/dead from the ad's live flag, so competitor activity is visible.
const spyderOnly = process.argv.includes('--spyder-only');
const swipefileOnly = process.argv.includes('--swipefile-only');

async function importBatch(ads, label, extras = {}) {
  if (!ads.length) return { checked: 0, inserted: 0, refreshed: 0 };

  // Dedupe on metrics.foreplay_id so re-runs (cron) never duplicate rows.
  const ids = ads.map((a) => a.id);
  const { data: existing, error: exErr } = await sb
    .from('ads')
    .select('id, verdict, metrics')
    .in('metrics->>foreplay_id', ids);
  if (exErr) throw new Error(`dedupe query (${label}): ${exErr.message}`);
  const byForeplayId = new Map((existing || []).map((r) => [r.metrics?.foreplay_id, r]));
  const fresh = ads.filter((a) => !byForeplayId.has(a.id));

  if (dryRun) {
    for (const ad of fresh) {
      console.log(JSON.stringify({ ...mapAd(ad), ...extras(ad) }, null, 2));
    }
    return { checked: ads.length, inserted: fresh.length, refreshed: ads.length - fresh.length };
  }

  let inserted = 0;
  for (const ad of fresh) {
    const row = { ...mapAd(ad), ...extras(ad) };
    row.media_path = await uploadMedia(ad, row.format);
    const { error } = await sb.from('ads').insert(row);
    if (error) {
      console.error(`  insert failed for ${ad.id}: ${error.message}`);
      continue;
    }
    inserted++;
    console.log(`  + [${label}] ${row.brand || 'Unknown brand'} (${row.platform}, ${row.format}${row.media_path ? '' : ', no media'}${row.verdict !== 'unsure' ? `, auto: ${row.verdict}` : ''})`);
  }

  // Refresh rows we already have: live flag, days running, status and the
  // auto verdict. Content fields (brand, hook, copy, tags) are left alone -
  // the team may have edited them.
  let refreshed = 0;
  for (const ad of ads) {
    const old = byForeplayId.get(ad.id);
    if (!old) continue;
    const mapped = { ...mapAd(ad), ...extras(ad) };
    const oldM = old.metrics || {};
    const metrics = { ...oldM, ...mapped.metrics, source: oldM.source || mapped.metrics.source };
    if (oldM.spyder_brand_id) metrics.spyder_brand_id = oldM.spyder_brand_id;

    const update = { metrics };
    // Status is factual (Foreplay's live flag); only touch it when we know.
    if (typeof ad.live === 'boolean') update.status = ad.live ? 'running' : 'dead';
    // Verdict is opinion: auto-update only rows a human never touched, i.e.
    // the verdict still equals whatever the script (or import default) set.
    const lastAuto = oldM.auto_verdict || 'unsure';
    const newAuto = mapped.brand === OUR_BRAND ? null : autoVerdict(ad.live, daysRunning(ad));
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
  return { checked: ads.length, inserted, refreshed };
}

const noExtras = () => ({});
let checked = 0;
let inserted = 0;
let refreshed = 0;

if (!spyderOnly) {
  // Walk the whole swipe file (offset pagination) so nothing is left behind
  // no matter how many ads the team has saved. --limit caps the page size.
  for (let offset = 0; ; offset += limit) {
    const ads = await foreplay('/api/swipefile/ads', { limit, offset, order: 'saved_newest' });
    const r = await importBatch(ads, 'swipefile', noExtras);
    checked += r.checked;
    inserted += r.inserted;
    refreshed += r.refreshed;
    if (ads.length < limit) break;
  }
}

if (!swipefileOnly) {
  // Page through all tracked brands (endpoint caps at 10 per page).
  const brands = [];
  for (let offset = 0; ; offset += 10) {
    const page = await foreplay('/api/spyder/brands', { limit: 10, offset });
    brands.push(...page);
    if (page.length < 10) break;
  }
  for (const brand of brands) {
    const brandId = brand.brand_id || brand.id;
    const ads = await foreplay('/api/spyder/brand/ads', {
      brand_id: brandId,
      limit,
      order: 'newest',
    });
    const r = await importBatch(ads, brand.name || 'spyder', (ad) => ({
      metrics: { ...mapAd(ad).metrics, source: 'foreplay-spyder', spyder_brand_id: brandId },
    }));
    checked += r.checked;
    inserted += r.inserted;
    refreshed += r.refreshed;
  }
}

console.log(
  `Foreplay import${dryRun ? ' (dry run)' : ''}: ${inserted} new, ${refreshed} refreshed (${checked} checked).`
);

// Show what is left of the monthly credit budget so nobody gets surprised.
try {
  const usage = await foreplay('/api/usage');
  if (usage?.remaining_credits != null) {
    console.log(`Foreplay credits: ${usage.remaining_credits}/${usage.total_credits} left until ${String(usage.end_date).slice(0, 10)}.`);
  }
} catch {
  /* usage is nice-to-have, never fail the import over it */
}
