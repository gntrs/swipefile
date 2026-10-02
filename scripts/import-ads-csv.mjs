// Import OUR OWN ad performance from a Meta Ads Manager CSV
// export into the `ads` table. This is the persistent memory of our ads:
// each row is matched BY AD NAME (metrics.ad_name), so re-uploading a newer
// export updates the same ads with fresh numbers instead of duplicating them.
// Names never seen before become new rows under your OWN_BRAND name.
//
// Workflow (until the Meta API replaces it, see CLAUDE.md roadmap):
//   1. Meta Ads Manager -> Reports -> Export table data -> .csv
//      (any breakdown works; rows with the same ad name are summed)
//   2. node scripts/import-ads-csv.mjs path/to/export.csv
//   3. Numbers land in metrics jsonb: spend, impressions, clicks, ctr, cpc,
//      roas, results, plus ad_name (the match key) and last_csv_import.
//
// Existing ads keep their verdict, tags, media, and notes; only metrics are
// refreshed. Flags: --dry-run (print, no writes), --parse-only (print the
// summed rows as JSON; needs no .env and no database).
// Needs in .env: VITE_DB_URL, DB_SERVICE_KEY, OWN_BRAND (your brand name; falls back to VITE_OWN_BRAND).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../src/lib/csv/parse.js';
import { metaColumns, aggregateMeta, metaRowFor } from '../src/lib/csv/meta.js';

// Tiny .env loader (no dotenv dep).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const dryRun = process.argv.includes('--dry-run');
const parseOnly = process.argv.includes('--parse-only');
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node scripts/import-ads-csv.mjs <meta-export.csv> [--dry-run] [--parse-only]');
  process.exit(1);
}

// Parsing and summing live in src/lib/csv/, shared with the import page in
// the app, so both write the same numbers.
const rows = parseCsv(fs.readFileSync(file, 'utf8'));
if (rows.length < 2) {
  console.error('CSV looks empty (no data rows).');
  process.exit(1);
}

const col = metaColumns(rows[0]);
if (col.name === -1) {
  console.error(`No "Ad name" column found. Columns in this file:\n  ${rows[0].join('\n  ')}`);
  process.exit(1);
}

// Sum rows per ad name (day/placement breakdowns collapse into totals).
const byName = aggregateMeta(rows.slice(1), col);
const today = new Date().toISOString().slice(0, 10);

// --parse-only: print what would be written, per ad name, and stop. Needs no
// .env and touches no database.
if (parseOnly) {
  const out = [...byName].map(([name, a]) => ({ name, ...metaRowFor(name, a, today) }));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// Your own brand name - rows are created/updated under this brand.
const OUR_BRAND = (process.env.OWN_BRAND || process.env.VITE_OWN_BRAND || "").trim();
if (!OUR_BRAND) {
  console.error("Missing OWN_BRAND (or VITE_OWN_BRAND) in .env (your brand name as used in the ads table).");
  process.exit(1);
}

const url = (process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL);
const key = (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY);
if (!url || !key) {
  console.error('Missing env. Need VITE_DB_URL and DB_SERVICE_KEY in .env.');
  process.exit(1);
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

let updated = 0;
let created = 0;

for (const [name, a] of byName) {
  const { fresh, status } = metaRowFor(name, a, today);

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
