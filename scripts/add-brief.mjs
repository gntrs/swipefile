// Save an analysis brief into the dashboard (briefs table) so the team can
// reread it on their phones and Claude can reread it any session.
//
// Usage:
//   node scripts/add-brief.mjs --title "Ads autopsy Jul 5" --file brief.txt
//   echo "body text" | node scripts/add-brief.mjs --title "Quick note"
//
// Needs in .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY (same as export.mjs).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing env. Need VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : null;
};
const title = flag('title');
if (!title) {
  console.error('Usage: node scripts/add-brief.mjs --title "..." [--file body.txt]  (or body on stdin)');
  process.exit(1);
}
const file = flag('file');
const body = (file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8')).trim();
if (!body) {
  console.error('Empty body. Pass --file or pipe text on stdin.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await sb
  .from('briefs')
  .insert({ title: title.trim(), body })
  .select('id, created_at')
  .single();
if (error) {
  console.error(`Insert failed: ${error.message}`);
  console.error(error.code === '42P01' || /briefs/.test(error.message) ? 'Did you run supabase-migration-9.sql?' : '');
  process.exit(1);
}
console.log(`Brief saved: "${title.trim()}" (${data.id}) at ${data.created_at}`);
