// Find Instagram creators in our niche via the Brave Search API and store
// them as creator_leads for the Outreach page. No Instagram scraping: we
// search the open web (site:instagram.com), and follower counts come from
// Instagram's own meta descriptions as surfaced in search snippets
// ("123K Followers, 45 Following, ..."). Counts Brave does not surface stay
// null and the UI shows them under "unknown" for a manual look.
//
// Usage:
//   node scripts/scrape-creators.mjs               # run the builtin niche queries
//   node scripts/scrape-creators.mjs --query "..."  # one custom query
//   node scripts/scrape-creators.mjs --job          # process the oldest pending
//                                                   # scrape_jobs row (cron mode;
//                                                   # exits quietly when none)
//
// Needs in .env: VITE_DB_URL, DB_SERVICE_KEY, BRAVE_API_KEY
// (free tier at brave.com/search/api is plenty: 1 req/sec, 2000/month).
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
const braveKey = process.env.BRAVE_API_KEY;
if (!url || !key || !braveKey) {
  console.error(
    'Missing env. Need VITE_DB_URL, DB_SERVICE_KEY and BRAVE_API_KEY in .env.\n' +
      'Brave key: brave.com/search/api -> free plan -> copy the subscription token.'
  );
  process.exit(1);
}
const sb = createClient(url, key);

const args = process.argv.slice(2);
const jobMode = args.includes('--job');
const customQuery = args.includes('--query') ? args[args.indexOf('--query') + 1] : null;
// --tier nano|small|mid|big: which follower band the run is FOR. Search
// engines cannot filter by follower count, so every creator found is kept;
// the band only shapes the summary (how many landed where you aimed).
const customTier = args.includes('--tier') ? args[args.indexOf('--tier') + 1] : null;

// What we search when the job does not override queries. Edit these defaults
// for your own niche - topics your target creators post about.
// Plain "<topic> instagram" queries yield far more profile results than
// site:instagram.com ones; handleFrom() below already keeps only Instagram
// profile URLs, and the niche gate keeps only on-topic accounts.
const DEFAULT_QUERIES = [
  'speech delay mom instagram',
  'late talker toddler mom instagram',
  'autism mom creator instagram',
  'speech therapist SLP kids instagram',
  'toddler speech activities instagram',
  'nonverbal autism AAC parent instagram',
  'early intervention speech therapy instagram',
  'autism parenting speech tips instagram',
];

// Hard niche gate: whatever the query was, a lead only gets stored if its
// name/handle/snippet shows a real signal of our world (speech development,
// autism, therapy for kids). This is what keeps "success coach" and
// "instagram expert" accounts out even when a custom query goes wide.
const NICHE_RE = /(speech|autis|\basd\b|\bslp\b|late.?talker|nonverbal|non.?verbal|\baac\b|apraxia|early.?intervention|language.?delay|language.?development|first.?words|speech.?therap|pediatric.?therap|special.?needs)/i;

// Tier cutoffs (followers). Tune here if the outreach pricing bands move.
function tierFor(followers) {
  if (followers == null) return null;
  if (followers < 50_000) return 'nano'; // the ~25k group
  if (followers < 100_000) return 'small';
  if (followers < 250_000) return 'mid';
  return 'big'; // 250k+ up to the ~1M group
}

// "123K Followers" / "1.2M Followers" / "45,678 Followers" -> integer.
function parseFollowers(text) {
  const m = (text || '').match(/([\d.,]+)\s*([KMkm])?\s*Followers/);
  if (!m) return null;
  const raw = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(raw)) return null;
  const mult = /k/i.test(m[2] || '') ? 1_000 : /m/i.test(m[2] || '') ? 1_000_000 : 1;
  return Math.round(raw * mult);
}

// instagram.com/<handle> profile URLs only; posts/reels/explore are not leads.
const NOT_HANDLES = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts', 'directory', 'about', 'legal', 'web']);
function handleFrom(resultUrl) {
  const m = resultUrl.match(/^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?(?:\?.*)?$/);
  if (!m) return null;
  const handle = m[1].toLowerCase();
  return NOT_HANDLES.has(handle) ? null : handle;
}

// "Name (@handle) • Instagram photos and videos" -> "Name".
function nameFrom(title, handle) {
  const cleaned = (title || '')
    .replace(/\s*[•|·-]\s*Instagram.*$/i, '')
    .replace(new RegExp(`\\s*\\(@?${handle}\\)\\s*`, 'i'), '')
    .trim();
  return cleaned || handle;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function braveSearch(query) {
  const u = new URL('https://api.search.brave.com/res/v1/web/search');
  u.searchParams.set('q', query);
  u.searchParams.set('count', '20');
  const res = await fetch(u, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey },
  });
  if (!res.ok) throw new Error(`Brave API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.web?.results || [];
}

async function scrape(queries, requestedBy, wantTier) {
  // Everything we already know about: existing leads + people already in the
  // outreach log (by handle in the creator field or the link).
  const [{ data: existing }, { data: outreach }] = await Promise.all([
    sb.from('creator_leads').select('handle'),
    sb.from('outreach').select('creator, link'),
  ]);
  const known = new Set((existing || []).map((r) => r.handle));
  for (const r of outreach || []) {
    const fromLink = handleFrom(r.link || '');
    if (fromLink) known.add(fromLink);
    const fromName = (r.creator || '').match(/@([A-Za-z0-9._]+)/);
    if (fromName) known.add(fromName[1].toLowerCase());
  }

  let checked = 0;
  let offNiche = 0;
  const fresh = new Map(); // handle -> row (dedupe across queries)
  for (const q of queries) {
    let results = [];
    try {
      results = await braveSearch(q);
    } catch (e) {
      console.error(`  query failed, skipping: ${q} (${e.message})`);
    }
    for (const r of results) {
      checked++;
      const handle = handleFrom(r.url || '');
      if (!handle || known.has(handle) || fresh.has(handle)) continue;
      const snippet = `${r.title || ''} ${r.description || ''}`;
      if (!NICHE_RE.test(`${handle} ${snippet}`)) {
        offNiche++;
        continue;
      }
      const followers = parseFollowers(snippet);
      fresh.set(handle, {
        handle,
        name: nameFrom(r.title, handle),
        url: `https://instagram.com/${handle}`,
        followers,
        tier: tierFor(followers),
        bio: (r.description || '').slice(0, 500) || null,
        source_query: q,
        added_by_email: requestedBy || 'scraper@import',
      });
    }
    await sleep(1100); // free plan: 1 request/second
  }

  const rows = [...fresh.values()];
  if (rows.length) {
    // upsert on handle so a race with a parallel run never throws
    const { error } = await sb.from('creator_leads').upsert(rows, { onConflict: 'handle', ignoreDuplicates: true });
    if (error) throw new Error(`insert failed: ${error.message}`);
  }
  const byTier = rows.reduce((acc, r) => ((acc[r.tier || 'unknown'] = (acc[r.tier || 'unknown'] || 0) + 1), acc), {});
  let summary = `${rows.length} new creators from ${queries.length} queries (${checked} results checked, ${offNiche} off-niche skipped)` +
    (rows.length ? ` - ${Object.entries(byTier).map(([t, n]) => `${t}: ${n}`).join(', ')}` : '');
  if (wantTier) summary += ` - ${byTier[wantTier] || 0} in your ${wantTier} band`;
  console.log(summary);
  return summary;
}

if (jobMode) {
  // Cron entry point: grab the oldest pending job, run it, record the outcome.
  const { data: jobs, error } = await sb
    .from('scrape_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at')
    .limit(1);
  if (error) {
    console.error(`scrape_jobs read failed: ${error.message}`);
    process.exit(1);
  }
  const job = jobs?.[0];
  if (!job) process.exit(0); // nothing queued, stay quiet
  await sb.from('scrape_jobs').update({ status: 'running' }).eq('id', job.id);
  try {
    const queries = Array.isArray(job.params?.queries) && job.params.queries.length
      ? job.params.queries
      : DEFAULT_QUERIES;
    const note = await scrape(queries, job.requested_by_email, job.params?.tier || null);
    await sb.from('scrape_jobs').update({ status: 'done', note, finished_at: new Date().toISOString() }).eq('id', job.id);
  } catch (e) {
    console.error(e.message);
    await sb.from('scrape_jobs').update({ status: 'error', note: e.message.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', job.id);
    process.exit(1);
  }
} else {
  await scrape(customQuery ? [customQuery] : DEFAULT_QUERIES, null, customTier);
}
