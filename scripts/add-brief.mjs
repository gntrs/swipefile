// Save a brief into the briefs table so it shows up in the app, on phones too,
// and can be reread in any later session.
//
// Usage:
//   node scripts/add-brief.mjs --title "Ads autopsy Jul 5" --file brief.txt
//   echo "body text" | node scripts/add-brief.mjs --title "Quick note"
//   node scripts/add-brief.mjs --title "..." --file brief.txt --ads <ad uuid>,<ad uuid>
//
// --ads links the brief to the ads it came from (shown as sources in Briefs).
// Needs in .env: VITE_DB_URL, DB_SERVICE_KEY (same as export.mjs).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE = 'Usage: node scripts/add-brief.mjs --title "..." [--file body.txt] [--ads id1,id2]  (or body on stdin)';

// Arguments first, so a typo is reported before anything else is needed.
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : null;
};
const title = flag('title');
if (!title || title.startsWith('--')) {
  console.error(USAGE);
  process.exit(1);
}
let adIds = [];
if (args.includes('--ads')) {
  const raw = flag('ads');
  adIds = [...new Set(String(raw || '').split(',').map((s) => s.trim()).filter(Boolean))];
  const bad = adIds.filter((id) => !UUID.test(id));
  if (!adIds.length || bad.length) {
    console.error(`--ads takes a comma list of ad ids (uuids).${bad.length ? ` Not an id: ${bad.join(', ')}` : ''}`);
    process.exit(1);
  }
}

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
  console.error('Missing env. Need VITE_DB_URL and DB_SERVICE_KEY in .env.');
  process.exit(1);
}

const file = flag('file');
const body = (file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8')).trim();
if (!body) {
  console.error('Empty body. Pass --file or pipe text on stdin.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const insert = (row) => sb.from('briefs').insert(row).select('id, created_at').single();

const row = { title: title.trim(), body };
if (adIds.length) row.source_ad_ids = adIds;
let { data, error } = await insert(row);
let kept = adIds.length;
if (error && error.code === 'PGRST204' && adIds.length) {
  // The briefs table predates the source columns: save the brief anyway.
  ({ data, error } = await insert({ title: title.trim(), body }));
  kept = 0;
  if (!error) console.error('Re-run db-setup.sql to keep brief sources.');
}
if (error) {
  console.error(`Insert failed: ${error.message}`);
  console.error(error.code === '42P01' || /briefs/.test(error.message) ? 'Did you run db-setup.sql?' : '');
  process.exit(1);
}
console.log(`Brief saved: "${title.trim()}" (${data.id}) at ${data.created_at}${kept ? `, ${kept} source ads` : ''}`);
