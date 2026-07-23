// Recompute the `verdict` column on the `ads` table using stricter, better-evidenced
// rules than the ones the importers apply at ingest time.
//
// THE RULES LIVE IN ONE PLACE: src/lib/ads.js -> scoreVerdict(). This script
// imports it, so a threshold is never tuned in two files. The UI (AdCard /
// Library) reads the very same function, so what you rescore is exactly what the
// team sees. Do not re-implement the logic here.
//
// Why rescore at all: the import rule was roughly "30+ days = winner", which
// ignored three things we actually know and scoreVerdict now uses:
//   1. live status - a dead ad that ran 90 days won then got retired; a dead ad
//      killed in 8 days is a loser. Same number, opposite meaning.
//   2. staleness  - days_running is a snapshot from metrics.last_synced. A verdict
//      built on a scrape 45+ days old is a guess, not a fact.
//   3. money      - our own-brand ads carry real spend/ROAS/CTR; those get
//      judged on performance, never on how long they ran.
//
// Safety: only rows whose verdict a script last set are rescored. That test is
// isAutoVerdict() from ads.js (verdict still equals metrics.auto_verdict, or the
// importer default for rows that never got one). A verdict a human changed by hand
// is left untouched. The new verdict is written back to metrics.auto_verdict too,
// so the human-edit check keeps working on the next run.
//
// Usage:  node scripts/rescore-verdicts.mjs                   # dry run (default, writes nothing)
//         node scripts/rescore-verdicts.mjs --dry-run         # explicit dry run (same as default)
//         node scripts/rescore-verdicts.mjs --apply           # actually write
//         node scripts/rescore-verdicts.mjs --out report.txt  # also dump the table to a file
// Needs in .env:  VITE_DB_URL, DB_SERVICE_KEY
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { scoreVerdict, isAutoVerdict, VERDICT_RULES } from '../src/lib/ads.js';

// Tiny .env loader (no dotenv dep). Run from the repo root.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const DB_URL = (process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL);
const SERVICE_KEY = (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY);
if (!DB_URL || !SERVICE_KEY) {
  console.error('Missing VITE_DB_URL or DB_SERVICE_KEY in .env');
  process.exit(1);
}
const db = createClient(DB_URL, SERVICE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply'); // safe by default: nothing is written without this
// --dry-run is accepted for clarity; it is already the default, and it must never
// coexist with --apply.
if (args.includes('--dry-run') && APPLY) {
  console.error('Pass either --dry-run or --apply, not both.');
  process.exit(1);
}
const outIdx = args.indexOf('--out');
const OUT = outIdx > -1 && args[outIdx + 1] ? args[outIdx + 1] : null;

const VERDICTS = ['winner', 'testing', 'loser', 'unsure'];

function tally(rows, pick) {
  const c = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  for (const r of rows) {
    const v = pick(r);
    c[VERDICTS.includes(v) ? v : 'unsure']++;
  }
  return c;
}

// Read every row (The database API caps a select at 1000). We pull the columns
// scoreVerdict / isAutoVerdict actually read: metrics (all the signal), status
// (fallback for live), brand, and added_by_email (importer-default check).
async function fetchAll() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('ads')
      .select('id, brand, status, verdict, added_by_email, metrics')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const rows = await fetchAll();
  const auto = rows.filter(isAutoVerdict);
  const manual = rows.length - auto.length;

  const changes = [];
  for (const ad of auto) {
    const { verdict: next, reason } = scoreVerdict(ad);
    if (next !== ad.verdict) changes.push({ ad, next, reason });
  }
  const nextById = new Map(changes.map((c) => [c.ad.id, c.next]));

  const before = tally(rows, (r) => r.verdict);
  const after = tally(rows, (r) => nextById.get(r.id) ?? r.verdict);

  const lines = [];
  lines.push(`mode ${APPLY ? 'APPLY' : 'dry-run'}`);
  lines.push('');
  lines.push('thresholds (from src/lib/ads.js VERDICT_RULES):');
  for (const [k, v] of Object.entries(VERDICT_RULES)) lines.push(`  ${k} = ${v}`);
  lines.push('');
  lines.push(`rows          ${rows.length}`);
  lines.push(`auto (scored) ${auto.length}`);
  lines.push(`manual (kept) ${manual}`);
  lines.push(`changed       ${changes.length}`);
  lines.push('');
  lines.push('verdict   before   after');
  for (const v of VERDICTS)
    lines.push(`${v.padEnd(8)} ${String(before[v]).padStart(6)}  ${String(after[v]).padStart(6)}`);
  lines.push('');
  // The moves that actually happened, so the numbers can be checked by hand.
  const moves = {};
  for (const c of changes) {
    const k = `${c.ad.verdict} -> ${c.next}`;
    moves[k] = (moves[k] || 0) + 1;
  }
  lines.push('transitions:');
  for (const k of Object.keys(moves).sort()) lines.push(`  ${k.padEnd(22)} ${moves[k]}`);
  lines.push('');
  // A handful of concrete examples with the reason string, so a cutoff is auditable.
  lines.push('sample changes (with reason):');
  for (const c of changes.slice(0, 12))
    lines.push(`  ${(c.ad.brand || '?').slice(0, 22).padEnd(24)} ${c.ad.verdict} -> ${c.next}  (${c.reason})`);

  if (APPLY) {
    let ok = 0;
    let fail = 0;
    for (const { ad, next } of changes) {
      const metrics = { ...(ad.metrics || {}), auto_verdict: next };
      const { error } = await db.from('ads').update({ verdict: next, metrics }).eq('id', ad.id);
      if (error) fail++;
      else ok++;
    }
    lines.push('');
    lines.push(`written ${ok}`);
    lines.push(`failed  ${fail}`);
  } else {
    lines.push('');
    lines.push('(dry run - nothing written. Re-run with --apply to persist.)');
  }

  const text = lines.join('\n') + '\n';
  if (OUT) fs.writeFileSync(path.resolve(process.cwd(), OUT), text);
  process.stdout.write(text);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
