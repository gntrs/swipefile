// Import YOUR OWN ad performance from a Meta Ads Manager CSV export into the
// `ads` table. This is the persistent memory of your ads: each row is matched
// BY AD NAME (metrics.ad_name), so re-uploading a newer export updates the
// same ads with fresh numbers instead of duplicating them. Names never seen
// before become new rows under your own brand (OWN_BRAND below).
//
// Workflow (import-meta-ads.mjs is the API-based alternative):
//   1. Meta Ads Manager -> Reports -> Export table data -> .csv
//      (any breakdown works; rows with the same ad name are summed)
//   2. node scripts/import-ads-csv.mjs path/to/export.csv
//   3. Numbers land in metrics jsonb: spend, impressions, clicks, ctr, cpc,
//      roas, results, plus ad_name (the match key) and last_csv_import.
//
// Existing ads keep their verdict, tags, media, and notes; only metrics are
// refreshed. Flags: --dry-run (print, no writes).
// Needs in .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY.
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

// Your own brand name as it should appear in the library. Set OWN_BRAND in
// .env, or edit the fallback here.
const OUR_BRAND = process.env.OWN_BRAND || 'My Brand';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing env. Need VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node scripts/import-ads-csv.mjs <meta-export.csv> [--dry-run]');
  process.exit(1);
}

// ---------------------- CSV parsing (no deps) -----------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  // Strip BOM.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  row.push(cell);
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}

// Meta renames columns depending on locale/metric setup, so match loosely.
function findCol(headers, ...patterns) {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h));
    if (i !== -1) return i;
  }
  return -1;
}

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const rows = parseCsv(fs.readFileSync(file, 'utf8'));
if (rows.length < 2) {
  console.error('CSV looks empty (no data rows).');
  process.exit(1);
}
const headers = rows[0].map((h) => h.trim().toLowerCase());

const col = {
  name: findCol(headers, /^ad name$/, /ad name/),
  spend: findCol(headers, /amount spent/, /^spend/),
  impressions: findCol(headers, /^impressions$/),
  clicks: findCol(headers, /^link clicks$/, /clicks \(all\)/, /^clicks$/),
  results: findCol(headers, /^results$/),
  roas: findCol(headers, /purchase roas/, /roas/),
  currency: findCol(headers, /^currency$/),
  // Ratio columns: some exports carry CTR/CPC/CPM directly instead of raw
  // impressions/clicks. Read them too and spend-weight when summing rows.
  ctr: findCol(headers, /ctr.*link click/, /^ctr/),
  cpc: findCol(headers, /cpc \(cost per link click/, /^cpc/),
  cpm: findCol(headers, /^cpm/),
  reach: findCol(headers, /^reach$/),
  lpv: findCol(headers, /landing page views/),
  freq: findCol(headers, /^frequency$/),
  plays3s: findCol(headers, /3-second video plays/),
  delivery: findCol(headers, /^ad delivery$/),
};
if (col.name === -1) {
  console.error(`No "Ad name" column found. Columns in this file:\n  ${rows[0].join('\n  ')}`);
  process.exit(1);
}

// Sum rows per ad name (day/placement breakdowns collapse into totals).
const byName = new Map();
for (const r of rows.slice(1)) {
  const name = (r[col.name] || '').trim();
  if (!name) continue;
  const a =
    byName.get(name) ||
    { spend: 0, impressions: 0, clicks: 0, results: 0, roasSpend: 0, roasSum: 0, currency: null,
      reach: 0, lpv: 0, plays3s: 0, delivery: null, w: {} };
  const rowSpend = col.spend !== -1 ? num(r[col.spend]) : 0;
  a.spend += rowSpend;
  a.impressions += col.impressions !== -1 ? num(r[col.impressions]) : 0;
  a.clicks += col.clicks !== -1 ? num(r[col.clicks]) : 0;
  a.results += col.results !== -1 ? num(r[col.results]) : 0;
  a.reach += col.reach !== -1 ? num(r[col.reach]) : 0;
  a.lpv += col.lpv !== -1 ? num(r[col.lpv]) : 0;
  a.plays3s += col.plays3s !== -1 ? num(r[col.plays3s]) : 0;
  if (col.delivery !== -1 && r[col.delivery]) a.delivery = r[col.delivery].trim().toLowerCase();
  if (col.roas !== -1 && r[col.roas] !== '') {
    a.roasSum += num(r[col.roas]) * (rowSpend || 1);
    a.roasSpend += rowSpend || 1;
  }
  // Spend-weighted averages for the ratio columns.
  for (const k of ['ctr', 'cpc', 'cpm', 'freq']) {
    if (col[k] !== -1 && r[col[k]] !== '') {
      a.w[k] = a.w[k] || { sum: 0, spend: 0 };
      a.w[k].sum += num(r[col[k]]) * (rowSpend || 1);
      a.w[k].spend += rowSpend || 1;
    }
  }
  if (col.currency !== -1 && r[col.currency]) a.currency = r[col.currency].trim();
  byName.set(name, a);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// One fetch: every ad we already track by name (ours only).
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
  const round2 = (n) => Math.round(n * 100) / 100;
  const weighted = (k) => (a.w[k]?.spend ? round2(a.w[k].sum / a.w[k].spend) : null);
  // Prefer raw counts; fall back to the export's own ratio columns, and
  // estimate the counts back from them so sorting has numbers to work with.
  const ctr = a.impressions ? round2((a.clicks / a.impressions) * 100) : weighted('ctr');
  const cpc = a.clicks ? round2(a.spend / a.clicks) : weighted('cpc');
  const cpm = weighted('cpm');
  const clicks = a.clicks || (cpc ? Math.round(a.spend / cpc) : 0);
  const impressions = a.impressions || (cpm ? Math.round((a.spend / cpm) * 1000) : 0);
  const fresh = {
    ad_name: name,
    source: 'meta-csv',
    spend: round2(a.spend),
    impressions,
    clicks,
    results: a.results,
    ctr,
    cpc,
    cpm: cpm ?? undefined,
    reach: a.reach || undefined,
    landing_page_views: a.lpv || undefined,
    frequency: weighted('freq') ?? undefined,
    video_plays_3s: a.plays3s || undefined,
    delivery: a.delivery || undefined,
    roas: a.roasSpend ? round2(a.roasSum / a.roasSpend) : null,
    currency: a.currency || undefined,
    last_csv_import: today,
  };
  // Meta's delivery column is the live truth for our own ads.
  const status = a.delivery === 'active' ? 'running' : a.delivery ? 'dead' : undefined;

  const found = byExistingName.get(name);
  if (dryRun) {
    console.log(`${found ? 'UPDATE' : 'CREATE'}  ${name}  ${JSON.stringify(fresh)}`);
    found ? updated++ : created++;
    continue;
  }

  if (found) {
    // Merge: CSV numbers win, anything else in metrics survives.
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
      added_by_email: 'csv@import',
    });
    if (error) {
      console.error(`  insert failed for "${name}": ${error.message}`);
      continue;
    }
    created++;
  }
}

console.log(
  `${dryRun ? '(dry run) ' : ''}Meta CSV import: ${created} new, ${updated} updated (${byName.size} ad names in file).`
);
