#!/usr/bin/env node
// Flags a batch of ads as "recently added" so the newest swipe shows up at a
// glance in the Library. The flag is a single-batch spotlight, not a history:
// every run clears the tag from whatever carried it before, so uploading a new
// batch expires the old one automatically. There is no timer to keep in sync.
//
//   node scripts/flag-recent.mjs --match "youtube|screen time" --verdict winner
//   node scripts/flag-recent.mjs --clear-only        # expire the current batch
//   node scripts/flag-recent.mjs --match "..." --dry-run
//
// --match is a case-insensitive regex tested against the whole ad record
// (hook, copy, and metrics.transcription), matching how the angle pull works.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

export const RECENT_TAG = 'recently-added';

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const dryRun = flag('dry-run');
const clearOnly = flag('clear-only');
const match = arg('match');
const verdict = arg('verdict');
const since = arg('since');

if (!clearOnly && !match && !verdict && !since) {
  console.error('Nothing selected. Pass --match / --verdict / --since, or --clear-only.');
  process.exit(1);
}

const sb = createClient((process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL), (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY), {
  auth: { persistSession: false },
});

const fetchAll = async () => {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('ads').select('*').range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
};

const run = async () => {
  const ads = await fetchAll();
  const rx = match ? new RegExp(match, 'i') : null;

  const selected = clearOnly
    ? []
    : ads.filter(
        (a) =>
          (!rx || rx.test(JSON.stringify(a))) &&
          (!verdict || a.verdict === verdict) &&
          (!since || a.created_at >= since)
      );

  const selectedIds = new Set(selected.map((a) => a.id));
  // Expiry: anything holding the tag that is not in the incoming batch loses it.
  const stale = ads.filter((a) => (a.tags || []).includes(RECENT_TAG) && !selectedIds.has(a.id));
  const incoming = selected.filter((a) => !(a.tags || []).includes(RECENT_TAG));

  console.log(`ads scanned      ${ads.length}`);
  console.log(`batch selected   ${selected.length}`);
  console.log(`newly tagged     ${incoming.length}`);
  console.log(`expired (clear)  ${stale.length}`);

  if (dryRun) {
    console.log('\n--dry-run, nothing written.');
    selected.slice(0, 10).forEach((a) => console.log(`  ${a.brand} — ${(a.hook || '').slice(0, 60)}`));
    return;
  }

  for (const ad of stale) {
    const tags = (ad.tags || []).filter((t) => t !== RECENT_TAG);
    const { error } = await sb.from('ads').update({ tags }).eq('id', ad.id);
    if (error) throw new Error(`clear ${ad.id}: ${error.message}`);
  }

  for (const ad of incoming) {
    const tags = [...(ad.tags || []), RECENT_TAG];
    const { error } = await sb.from('ads').update({ tags }).eq('id', ad.id);
    if (error) throw new Error(`tag ${ad.id}: ${error.message}`);
  }

  console.log(`\ndone — ${selected.length} ad(s) now flagged "${RECENT_TAG}".`);
};

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
