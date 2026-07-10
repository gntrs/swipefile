// Import YOUR OWN ad performance straight from the Meta Marketing API into
// the `ads` table. This replaces the CSV export flow (import-ads-csv.mjs
// stays around as the manual fallback): same persistent ad memory, same match
// key. Each row is matched BY AD NAME (metrics.ad_name), so every run
// refreshes the same ads with live numbers instead of duplicating them. Names
// never seen before become new rows under your own brand (OWN_BRAND below).
//
// Usage:
//   node scripts/import-meta-ads.mjs [--dry-run] [--days N]
//     --dry-run  print what would be written, no writes
//     --days N   pull a trailing window instead of lifetime numbers. The
//                library sorts on lifetime totals, so only use this with
//                --dry-run to eyeball recent movement; a real run with --days
//                would overwrite lifetime metrics with window metrics.
//
// Needs in .env (next to the Supabase keys):
//   META_ACCESS_TOKEN     long-lived token with ads_read. Get one at
//                         developers.facebook.com: create a Business-type
//                         app -> add Marketing API -> Business Settings ->
//                         System Users -> generate token (ads_read), assign
//                         the ad account asset. System-user tokens do not
//                         expire, which is what a cron wants.
//   META_AD_ACCOUNT_ID    the ad account, with or without the act_ prefix
//                         (in Ads Manager's URL as act=<number>).
//
// Existing ads keep their verdict, tags, media, and notes; only metrics and
// running/dead status are refreshed. Idempotent, safe on a cron.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const GRAPH = 'https://graph.facebook.com/v23.0';

// Tiny .env loader (no dotenv dep).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// Your own brand name as it should appear in the library. Set OWN_BRAND in
// .env, or edit the fallback here.
const OUR_BRAND = process.env.OWN_BRAND || 'My Brand';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const token = process.env.META_ACCESS_TOKEN;
let account = process.env.META_AD_ACCOUNT_ID || '';
if (!url || !key) {
  console.error('Missing env. Need VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.');
  process.exit(1);
}
if (!token || !account) {
  console.error(
    'Missing Meta env. Add to .env:\n' +
      '  META_ACCESS_TOKEN=    (system-user token with ads_read, see header of this script)\n' +
      '  META_AD_ACCOUNT_ID=   (act_<number>, from the Ads Manager URL)'
  );
  process.exit(1);
}
if (!account.startsWith('act_')) account = `act_${account}`;

const dryRun = process.argv.includes('--dry-run');
const daysIdx = process.argv.indexOf('--days');
const days = daysIdx > -1 ? parseInt(process.argv[daysIdx + 1], 10) : null;
if (days && !dryRun) {
  console.warn('WARNING: --days without --dry-run overwrites lifetime metrics with window metrics.');
}

// ------------------------- Graph API helpers -------------------------
async function graph(pathAndQuery) {
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}/${pathAndQuery}${sep}access_token=${encodeURIComponent(token)}`);
  const json = await res.json();
  if (json.error) {
    throw new Error(`Meta API: ${json.error.message} (code ${json.error.code}, type ${json.error.type})`);
  }
  return json;
}

// Follow paging.next until done.
async function graphAll(firstPathAndQuery) {
  const out = [];
  let page = await graph(firstPathAndQuery);
  for (;;) {
    out.push(...(page.data || []));
    const next = page.paging?.next;
    if (!next) break;
    const res = await fetch(next);
    page = await res.json();
    if (page.error) throw new Error(`Meta API (paging): ${page.error.message}`);
  }
  return out;
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;

// Pull one value out of Meta's actions array ([{action_type, value}, ...]),
// trying the given action_type names in order.
function action(list, ...types) {
  if (!Array.isArray(list)) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return num(hit.value);
  }
  return 0;
}

// ------------------------------ Fetch --------------------------------
const acct = await graph(`${account}?fields=name,currency`);

// Live status per ad name: an ad name counts as active if ANY ad carrying it
// is ACTIVE (the same name can exist across ad sets; Meta sums them in
// reports and so do we).
const adRows = await graphAll(`${account}/ads?fields=name,effective_status&limit=200`);
const statusByName = new Map();
for (const ad of adRows) {
  const name = (ad.name || '').trim();
  if (!name) continue;
  const prev = statusByName.get(name);
  statusByName.set(name, prev === 'active' ? 'active' : ad.effective_status === 'ACTIVE' ? 'active' : (ad.effective_status || '').toLowerCase());
}

const range = days ? `date_preset=last_${days}d` : 'date_preset=maximum';
const insightRows = await graphAll(
  `${account}/insights?level=ad&limit=500&${range}` +
    `&fields=ad_name,spend,impressions,inline_link_clicks,reach,frequency,actions,purchase_roas`
);

// Sum rows per ad name (mirrors the CSV importer: same-name rows collapse).
const byName = new Map();
for (const r of insightRows) {
  const name = (r.ad_name || '').trim();
  if (!name) continue;
  const a =
    byName.get(name) ||
    { spend: 0, impressions: 0, clicks: 0, reach: 0, lpv: 0, plays3s: 0, purchases: 0, registrations: 0,
      roasSum: 0, roasSpend: 0, freqSum: 0, freqSpend: 0 };
  const rowSpend = num(r.spend);
  a.spend += rowSpend;
  a.impressions += num(r.impressions);
  a.clicks += num(r.inline_link_clicks);
  a.reach += num(r.reach);
  a.lpv += action(r.actions, 'landing_page_view');
  a.plays3s += action(r.actions, 'video_view'); // Meta's video_view = 3-second plays
  a.purchases += action(r.actions, 'omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase');
  a.registrations += action(r.actions, 'omni_complete_registration', 'complete_registration');
  const roas = action(r.purchase_roas, 'omni_purchase', 'purchase');
  if (roas) {
    a.roasSum += roas * (rowSpend || 1);
    a.roasSpend += rowSpend || 1;
  }
  if (r.frequency) {
    a.freqSum += num(r.frequency) * (rowSpend || 1);
    a.freqSpend += rowSpend || 1;
  }
  byName.set(name, a);
}

// ------------------------------ Write --------------------------------
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: existing, error: exErr } = await sb
  .from('ads')
  .select('id, metrics')
  .eq('brand', OUR_BRAND)
  .not('metrics->>ad_name', 'is', null);
if (exErr) throw new Error(exErr.message);
const byExistingName = new Map((existing || []).map((r) => [r.metrics.ad_name, r]));

const today = new Date().toISOString().slice(0, 10);
let updated = 0;
let created = 0;

for (const [name, a] of byName) {
  const ctr = a.impressions ? round2((a.clicks / a.impressions) * 100) : null;
  const cpc = a.clicks ? round2(a.spend / a.clicks) : null;
  const cpm = a.impressions ? round2((a.spend / a.impressions) * 1000) : null;
  const delivery = statusByName.get(name) || undefined;
  const fresh = {
    ad_name: name,
    source: 'meta-api',
    spend: round2(a.spend),
    impressions: a.impressions,
    clicks: a.clicks,
    results: a.purchases || a.registrations,
    purchases: a.purchases || undefined,
    registrations: a.registrations || undefined,
    ctr,
    cpc,
    cpm: cpm ?? undefined,
    reach: a.reach || undefined,
    landing_page_views: a.lpv || undefined,
    frequency: a.freqSpend ? round2(a.freqSum / a.freqSpend) : undefined,
    video_plays_3s: a.plays3s || undefined,
    delivery,
    roas: a.roasSpend ? round2(a.roasSum / a.roasSpend) : null,
    currency: acct.currency || undefined,
    last_meta_sync: today,
  };
  // effective_status is the live truth for our own ads.
  const status = delivery === 'active' ? 'running' : delivery ? 'dead' : undefined;

  const found = byExistingName.get(name);
  if (dryRun) {
    console.log(`${found ? 'UPDATE' : 'CREATE'}  ${name}  ${JSON.stringify(fresh)}`);
    found ? updated++ : created++;
    continue;
  }

  if (found) {
    // Merge: API numbers win, anything else in metrics survives.
    const { error } = await sb
      .from('ads')
      .update({ metrics: { ...found.metrics, ...fresh }, ...(status ? { status } : {}) })
      .eq('id', found.id);
    if (error) {
      console.error(`  update failed for "${name}": ${error.message}`);
      continue;
    }
    updated++;
  } else {
    const { error } = await sb.from('ads').insert({
      brand: OUR_BRAND,
      platform: 'Facebook',
      format: 'video', // placeholder; fix per ad in the UI if it is an image
      status: status || 'running',
      verdict: 'testing',
      hook: name, // the ad name is the best label we have until someone edits
      metrics: fresh,
      added_by_email: 'meta@import',
    });
    if (error) {
      console.error(`  insert failed for "${name}": ${error.message}`);
      continue;
    }
    created++;
  }
}

console.log(
  `${dryRun ? '(dry run) ' : ''}Meta API import [${acct.name}, ${range}]: ` +
    `${created} new, ${updated} updated (${byName.size} ad names).`
);
