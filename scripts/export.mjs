// Export all dashboard data to .claude-data/export.json so Claude Code can
// read and analyze it (RLS blocks the anon key, so this uses the service_role
// key from .env - local only, never committed, never in frontend code).
//
// Usage:  node scripts/export.mjs
// Needs in .env:  VITE_DB_URL, DB_SERVICE_KEY
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
  console.error(
    'Missing env. Need VITE_DB_URL and DB_SERVICE_KEY in .env.\n' +
      "Get the service_role key: your database provider's dashboard -> API settings -> service_role.\n" +
      'It stays local (gitignored). NEVER put it in frontend code or Vercel.'
  );
  process.exit(1);
}

const sb = createClient(url, key);

// The database API caps a single select at 1000 rows. The ads table is well past that
// (thousands of competitor + own ads), so a plain select silently dropped
// everything after the first 1000 - every analysis pass was reading a
// truncated dataset. Page through with .range() until the table is exhausted.
const PAGE = 1000;
async function all(table, order = 'created_at') {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .order(order, { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const [ads, posts, comments, team, chat_messages, goals, outreach, availability, briefs, creator_leads, competitors, kpi_snapshots, sales] = await Promise.all([
  all('ads'),
  all('posts'),
  all('comments'),
  all('team').catch(() => []),
  all('chat_messages').catch(() => []),
  all('goals').catch(() => []),
  all('outreach').catch(() => []),
  all('availability', 'day').catch(() => []),
  all('briefs').catch(() => []),
  all('creator_leads').catch(() => []),
  all('competitors').catch(() => []),
  all('kpi_snapshots', 'day').catch(() => []),
  all('sales', 'paid_at').catch(() => []),
]);

const out = {
  exported_at: new Date().toISOString(),
  counts: {
    ads: ads.length,
    posts: posts.length,
    comments: comments.length,
    team: team.length,
    chat_messages: chat_messages.length,
    goals: goals.length,
    outreach: outreach.length,
    availability: availability.length,
    briefs: briefs.length,
    creator_leads: creator_leads.length,
    competitors: competitors.length,
    kpi_snapshots: kpi_snapshots.length,
    sales: sales.length,
  },
  ads,
  posts,
  comments,
  team,
  chat_messages,
  goals,
  outreach,
  availability,
  briefs,
  creator_leads,
  competitors,
  kpi_snapshots,
  sales,
};

fs.mkdirSync('.claude-data', { recursive: true });
fs.writeFileSync('.claude-data/export.json', JSON.stringify(out, null, 2));
console.log(
  `Exported ${ads.length} ads, ${posts.length} posts, ${comments.length} comments, ${team.length} team profiles, ${chat_messages.length} chat messages, ${goals.length} goals, ${outreach.length} outreach rows, ${availability.length} availability blocks, ${briefs.length} briefs, ${creator_leads.length} creator leads, ${competitors.length} competitors, ${kpi_snapshots.length} kpi snapshots, ${sales.length} sales -> .claude-data/export.json`
);
