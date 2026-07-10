// Claude's action items on the dashboard (goals table).
//
//   node scripts/add-goal.mjs --list-open
//       Print open (done=false) goals authored by Claude, so a caller can
//       check "is this already tracked" before adding a new one.
//
//   node scripts/add-goal.mjs --title "..." [--horizon 1w|2w|1m] [--deadline YYYY-MM-DD] [--urgent]
//       Insert a new goal, created_by_email 'claude@analysis' (shown as
//       "by Claude" on the dashboard). horizon defaults to 1w.
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
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : null;
};

if (args[0] === '--list-open') {
  const { data, error } = await sb
    .from('goals')
    .select('id, title, horizon, deadline, urgent, created_at')
    .eq('created_by_email', 'claude@analysis')
    .eq('done', false)
    .order('created_at', { ascending: false });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!data.length) {
    console.log('(no open Claude goals)');
  } else {
    data.forEach((g) => {
      console.log(`- [${g.id}] ${g.title} (${g.horizon}${g.urgent ? ', urgent' : ''}${g.deadline ? `, due ${g.deadline}` : ''})`);
    });
  }
  process.exit(0);
}

const title = flag('title');
if (!title) {
  console.error('Usage: node scripts/add-goal.mjs --list-open  |  --title "..." [--horizon 1w|2w|1m] [--deadline YYYY-MM-DD] [--urgent]');
  process.exit(1);
}
const horizon = flag('horizon') || '1w';
if (!['1w', '2w', '1m'].includes(horizon)) {
  console.error('Invalid --horizon. Use 1w, 2w, or 1m.');
  process.exit(1);
}
const deadline = flag('deadline') || null;
const urgent = args.includes('--urgent');

const { data, error } = await sb
  .from('goals')
  .insert({
    title: title.trim(),
    horizon,
    deadline,
    urgent,
    done: false,
    created_by_email: 'claude@analysis',
  })
  .select('id, created_at')
  .single();
if (error) {
  console.error(`Insert failed: ${error.message}`);
  process.exit(1);
}
console.log(`Goal added: "${title.trim()}" (${data.id}) at ${data.created_at}`);
