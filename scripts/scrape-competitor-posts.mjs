// Best-effort competitor ORGANIC posts via the Brave Search API: for every
// active competitor with an ig_handle (competitors table, migration 15),
// find fresh instagram.com post/reel URLs and log them as `posts` rows with
// `brand` set, so they show up on /competitors next to the ads.
//
// Honest limits: this is web search, not Instagram scraping. We get the URL,
// the caption snippet and roughly when it appeared - no views/likes. Metrics
// stay empty; a human adds them if a post matters. Search indexes only
// surface a slice of what an account posts, so treat this as "what of theirs
// is getting around", not a complete feed.
//
// Usage:  node scripts/scrape-competitor-posts.mjs             # all active competitors
//         node scripts/scrape-competitor-posts.mjs --dry-run   # print, no writes
//         node scripts/scrape-competitor-posts.mjs --brand "Name"
// Needs in .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY, BRAVE_API_KEY
// (same free tier as scrape-creators.mjs: 1 req/sec, 2000/month; this uses
// one request per competitor per run - weekly cron, so pennies of budget).
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

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const braveKey = process.env.BRAVE_API_KEY;
if (!url || !key || !braveKey) {
  console.error('Missing env. Need VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY and BRAVE_API_KEY in .env.');
  process.exit(1);
}
const sb = createClient(url, key);

const dryRun = process.argv.includes('--dry-run');
const onlyBrand = process.argv.flatMap((a, i) => (a === '--brand' ? [process.argv[i + 1]] : []))[0];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function braveSearch(query) {
  const u = new URL('https://api.search.brave.com/res/v1/web/search');
  u.searchParams.set('q', query);
  u.searchParams.set('count', '20');
  u.searchParams.set('freshness', 'pm'); // past month: this runs weekly
  const res = await fetch(u, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey },
  });
  if (!res.ok) throw new Error(`Brave API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.web?.results || [];
}

// instagram.com/p/<code>, instagram.com/<handle>/p/<code>, .../reel/<code>.
// The shortcode is the stable identity of a post - dedupe on it.
function postFrom(resultUrl, handle) {
  const m = (resultUrl || '').match(
    /^https?:\/\/(?:www\.)?instagram\.com\/(?:([A-Za-z0-9._]+)\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/
  );
  if (!m) return null;
  const [, pathHandle, kind, code] = m;
  // When the URL carries a handle, require it to be the competitor's; the
  // short instagram.com/p/... form can belong to anyone, caller checks text.
  if (pathHandle && pathHandle.toLowerCase() !== handle) return null;
  return {
    code,
    matched: Boolean(pathHandle),
    post_type: kind === 'p' ? 'post' : kind === 'tv' ? 'video' : 'reel',
    url: `https://www.instagram.com/${handle}/${kind === 'p' ? 'p' : 'reel'}/${code}/`,
  };
}

// "Name on Instagram: \"caption...\"" -> caption; otherwise the title as-is.
function titleFrom(r) {
  const t = (r.title || '').replace(/\s*[•|·-]\s*Instagram.*$/i, '').trim();
  const cap = t.match(/on Instagram:?\s*["“](.+?)["”]?$/i);
  return (cap ? cap[1] : t).slice(0, 140) || null;
}

const shortcodeOf = (u) => (u || '').match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1] || null;

// ------------------------------ run ----------------------------------
let q = sb.from('competitors').select('*').eq('active', true).not('ig_handle', 'is', null).order('brand');
if (onlyBrand) q = q.ilike('brand', onlyBrand);
const { data: competitors, error: compErr } = await q;
if (compErr) {
  console.error(`competitors read failed: ${compErr.message} (did migration 15 run in the Supabase SQL editor?)`);
  process.exit(1);
}
if (!competitors?.length) {
  console.log('No active competitors with an ig_handle. Fill handles in on /competitors.');
  process.exit(0);
}

// Every competitor post we already logged, by shortcode.
const { data: existingPosts, error: pErr } = await sb.from('posts').select('url').not('brand', 'is', null);
if (pErr) {
  console.error(`posts read failed: ${pErr.message}`);
  process.exit(1);
}
const known = new Set((existingPosts || []).map((r) => shortcodeOf(r.url)).filter(Boolean));

let total = 0;
for (const comp of competitors) {
  const handle = comp.ig_handle.replace(/^@/, '').toLowerCase();
  let results = [];
  try {
    results = await braveSearch(`site:instagram.com "${handle}"`);
  } catch (e) {
    console.error(`${comp.brand}: search failed, skipping (${e.message})`);
    continue;
  }

  const fresh = new Map(); // shortcode -> row
  for (const r of results) {
    const hit = postFrom(r.url, handle);
    if (!hit || known.has(hit.code) || fresh.has(hit.code)) continue;
    // Short /p/<code> URLs carry no handle: only trust them when the snippet
    // clearly names the account.
    const snippet = `${r.title || ''} ${r.description || ''}`;
    if (!hit.matched && !snippet.toLowerCase().includes(handle)) continue;
    const postedAt = (r.page_age || '').slice(0, 10) || null;
    fresh.set(hit.code, {
      brand: comp.brand,
      platform: 'Instagram',
      post_type: hit.post_type,
      url: hit.url,
      title: titleFrom(r),
      copy: (r.description || '').slice(0, 1000) || null,
      posted_at: /^\d{4}-\d{2}-\d{2}$/.test(postedAt || '') ? postedAt : null,
      metrics: { source: 'brave-scrape', source_query: `site:instagram.com "${handle}"` },
      added_by_email: 'brave@scrape',
    });
  }

  const rows = [...fresh.values()];
  if (dryRun) {
    for (const row of rows) console.log(JSON.stringify(row, null, 2));
  } else if (rows.length) {
    const { error } = await sb.from('posts').insert(rows);
    if (error) {
      console.error(`${comp.brand}: insert failed (${error.message})`);
      continue;
    }
    for (const c of fresh.keys()) known.add(c);
  }
  total += rows.length;
  console.log(`${comp.brand} (@${handle}): ${rows.length} new post${rows.length === 1 ? '' : 's'}`);
  await sleep(1100); // free plan: 1 request/second
}

console.log(`Competitor posts${dryRun ? ' (dry run)' : ''}: ${total} new across ${competitors.length} brand${competitors.length === 1 ? '' : 's'}.`);
