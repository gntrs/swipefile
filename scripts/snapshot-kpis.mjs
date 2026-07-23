// Write one kpi_snapshots row per day (migration 16) from the PostHog pull,
// so the dashboard can draw funnel + traffic trends without touching PostHog
// from the browser. Reads .claude-data/posthog.json (produced by
// scripts/posthog-pull.mjs), so run it AFTER that in the cron.
//
// Each day's `metrics` jsonb carries `traffic` (pageviews/visitors) and
// `funnel` (the counts for the meaningful stages). Keys are MERGED into any
// existing row for that day, so when Stripe lands and writes a `revenue` key
// for the same days, neither source clobbers the other.
//
// Usage:  node scripts/snapshot-kpis.mjs            # all days in posthog.json
//         node scripts/snapshot-kpis.mjs --days 7   # only the last N days
// Needs in .env: VITE_DB_URL, DB_SERVICE_KEY (service key, so the
// write bypasses RLS - same as export.mjs). Idempotent, safe on the cron.
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
const key = (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY);
if (!url || !key) {
  console.error('Missing VITE_DB_URL or DB_SERVICE_KEY in .env');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const phPath = path.resolve('.claude-data/posthog.json');
if (!fs.existsSync(phPath)) {
  console.error('No .claude-data/posthog.json - run `node scripts/posthog-pull.mjs` first.');
  process.exit(1);
}
const ph = JSON.parse(fs.readFileSync(phPath, 'utf8'));

const daysArg = process.argv.flatMap((a, i) => (a === '--days' ? [process.argv[i + 1]] : []))[0];
const daysLimit = daysArg ? parseInt(daysArg, 10) : null;

// The funnel stages we care about, top to bottom. Stored by their raw event
// name so the frontend can relabel/reorder without a data migration.
const FUNNEL_EVENTS = [
  'landing_cta_clicked',
  'fb_onb_started',
  'fb_onb_completed',
  'user_registered',
  'payment_initiated',
  'payment_completed',
];

// day -> { traffic:{pageviews,visitors}, funnel:{event:total} }
const byDay = new Map();
for (const t of ph.daily_traffic || []) {
  if (!t.day) continue;
  byDay.set(t.day, { traffic: { pageviews: t.pageviews || 0, visitors: t.visitors || 0 }, funnel: {} });
}
for (const r of ph.custom_events_daily || []) {
  if (!FUNNEL_EVENTS.includes(r.event)) continue;
  const row = byDay.get(r.day) || { traffic: { pageviews: 0, visitors: 0 }, funnel: {} };
  row.funnel[r.event] = (row.funnel[r.event] || 0) + (r.total || 0);
  byDay.set(r.day, row);
}

let days = [...byDay.keys()].sort();
if (daysLimit) days = days.slice(-daysLimit);
if (!days.length) {
  console.log('No daily data in posthog.json to snapshot.');
  process.exit(0);
}

// Merge into existing rows so a Stripe `revenue` key (or a re-run of another
// source) is never dropped.
const { data: existing } = await sb.from('kpi_snapshots').select('day, metrics').in('day', days);
const prev = new Map((existing || []).map((r) => [r.day, r.metrics || {}]));

const rows = days.map((day) => ({
  day,
  metrics: { ...(prev.get(day) || {}), ...byDay.get(day) },
  updated_at: new Date().toISOString(),
}));

const { error } = await sb.from('kpi_snapshots').upsert(rows, { onConflict: 'day' });
if (error) {
  console.error(`kpi_snapshots upsert failed: ${error.message} (did migration 16 run?)`);
  process.exit(1);
}

const last = byDay.get(days[days.length - 1]);
console.log(
  `Snapshotted ${rows.length} day(s) ${days[0]} -> ${days[days.length - 1]}. ` +
    `Latest: ${last.traffic.visitors} visitors, ` +
    `${last.funnel.fb_onb_started || 0} onb started, ${last.funnel.payment_completed || 0} paid.`
);
