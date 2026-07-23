// Daily organic-rank check for your own domain and its competitors, via the
// Brave Search API. One row per (day, market, term, domain) so a term's
// position can be charted over time per country.
//
// Reads the keyword set from scripts/seo-keywords.mjs. Terms there are the
// long-tail queries your target customer actually types; see that file for why.
//
// What "position" means here: the 1-based index of the first organic result
// whose host matches the domain, within the first `--depth` results Brave
// returned. NULL position + a `scanned` count means "we looked at N results
// and it was not there" - which is different from "we do not know", and the
// UI must not draw those the same way.
//
// Usage:
//   node scripts/seo-rank-pull.mjs                 # all markets, top 20
//   node scripts/seo-rank-pull.mjs --dry-run       # fetch + print, write nothing
//   node scripts/seo-rank-pull.mjs --market ES     # one market only
//   node scripts/seo-rank-pull.mjs --limit 3       # first N terms per market
//   node scripts/seo-rank-pull.mjs --depth 40      # scan 2 pages instead of 1
//   node scripts/seo-rank-pull.mjs --day 2026-07-20  # backfill/overwrite a day
//
// Needs in .env: VITE_DB_URL, DB_SERVICE_KEY, BRAVE_API_KEY
// (free tier: 1 req/sec, 2000/month. Default run = 21 requests.)
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { SEO_TERMS, OUR_DOMAIN, COMPETITOR_DOMAINS } from './seo-keywords.mjs';

// Tiny .env loader (no dotenv dep).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const DRY = args.includes('--dry-run');
const ONLY_MARKET = flag('--market');
const LIMIT = Number(flag('--limit', 0)) || 0;
const DEPTH = Math.min(Number(flag('--depth', 20)) || 20, 100);
const DAY = flag('--day') || new Date().toISOString().slice(0, 10);

// --tier 1 | all. Default: tier 1 every day, plus tier 2 on Mondays, which
// keeps the shared Brave free quota at roughly 800 requests a month. See the
// tier note in seo-keywords.mjs.
const TIER = (flag('--tier') || 'auto').toLowerCase();
const isMonday = new Date(`${DAY}T00:00:00Z`).getUTCDay() === 1;
const wantTier2 = TIER === 'all' ? true : TIER === '1' ? false : isMonday;

const url = (process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL);
const key = (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY);
const braveKey = process.env.BRAVE_API_KEY;
if (!OUR_DOMAIN) {
  console.error('Missing SEO_OWN_DOMAIN in .env (your own domain, e.g. example.com).');
  process.exit(1);
}
if (!braveKey) {
  console.error('Missing BRAVE_API_KEY in .env. brave.com/search/api -> free plan -> subscription token.');
  process.exit(1);
}
if (!DRY && (!url || !key)) {
  console.error('Missing VITE_DB_URL / DB_SERVICE_KEY in .env (or pass --dry-run).');
  process.exit(1);
}
const sb = DRY ? null : createClient(url, key, { auth: { persistSession: false } });

const ALL_DOMAINS = [OUR_DOMAIN, ...COMPETITOR_DOMAINS];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// example.com matches example.com and www.example.com and app.example.com,
// but NOT notexample.com.
function hostMatches(host, domain) {
  const h = host.toLowerCase().replace(/^www\./, '');
  return h === domain || h.endsWith('.' + domain);
}

// One Brave page. Returns [] on a soft failure so one bad page cannot kill the
// run; retries once on 429 with a longer back-off.
async function bravePage(term, market, lang, offset) {
  const u = new URL('https://api.search.brave.com/res/v1/web/search');
  u.searchParams.set('q', term);
  u.searchParams.set('count', '20');
  u.searchParams.set('offset', String(offset));
  u.searchParams.set('country', market);
  u.searchParams.set('search_lang', lang);
  u.searchParams.set('safesearch', 'moderate');

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(u, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey },
    });
    if (res.status === 429) {
      if (attempt === 0) {
        await sleep(5000);
        continue;
      }
      throw new Error('rate limited (429) twice');
    }
    if (!res.ok) throw new Error(`brave ${res.status}`);
    const json = await res.json();
    return json?.web?.results || [];
  }
  return [];
}

async function checkTerm({ term, market, lang }) {
  const pages = Math.ceil(DEPTH / 20);
  let results = [];
  for (let p = 0; p < pages; p++) {
    if (p > 0) await sleep(1100); // free tier is 1 req/sec
    const page = await bravePage(term, market, lang, p);
    results = results.concat(page);
    if (page.length < 20) break; // no more results to page through
  }
  results = results.slice(0, DEPTH);

  const scanned = results.length;
  return ALL_DOMAINS.map((domain) => {
    let position = null;
    let foundUrl = null;
    let title = null;
    for (let i = 0; i < results.length; i++) {
      let host = '';
      try {
        host = new URL(results[i].url).hostname;
      } catch {
        continue;
      }
      if (hostMatches(host, domain)) {
        position = i + 1;
        foundUrl = results[i].url;
        title = results[i].title || null;
        break;
      }
    }
    return {
      day: DAY,
      market,
      lang,
      term,
      domain,
      is_ours: domain === OUR_DOMAIN,
      position,
      url: foundUrl,
      title,
      scanned,
      engine: 'brave',
    };
  });
}

async function main() {
  let terms = SEO_TERMS;
  if (!wantTier2) terms = terms.filter((t) => (t.tier || 1) === 1);
  if (ONLY_MARKET) terms = terms.filter((t) => t.market === ONLY_MARKET.toUpperCase());
  if (LIMIT) {
    const byMarket = new Map();
    terms = terms.filter((t) => {
      const n = (byMarket.get(t.market) || 0) + 1;
      byMarket.set(t.market, n);
      return n <= LIMIT;
    });
  }
  if (!terms.length) {
    console.error(`No terms matched --market ${ONLY_MARKET}.`);
    process.exit(1);
  }

  console.log(`SEO ranks for ${DAY} - ${terms.length} terms, top ${DEPTH}${DRY ? ' (dry run)' : ''}`);

  const rows = [];
  const failures = [];
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    if (i > 0) await sleep(1100);
    try {
      const got = await checkTerm(t);
      rows.push(...got);
      const ours = got.find((r) => r.is_ours);
      const board = got
        .filter((r) => r.position)
        .sort((a, b) => a.position - b.position)
        .map((r) => `${r.domain}#${r.position}`)
        .join(' ');
      console.log(
        `  [${t.market}] ${t.term}\n      us: ${ours.position ? '#' + ours.position : `not in top ${got[0].scanned}`}` +
          (board ? `\n      serp: ${board}` : '')
      );
    } catch (err) {
      // One term failing must not lose the rest of the run.
      failures.push({ market: t.market, term: t.term, error: String(err.message || err) });
      console.log(`  [${t.market}] ${t.term}\n      FAILED: ${err.message || err}`);
    }
  }

  if (DRY) {
    console.log(`\nDry run: ${rows.length} rows would be written, ${failures.length} term(s) failed.`);
    return;
  }

  // Idempotent: PK is (day, market, term, domain), so re-running the same day
  // overwrites rather than duplicating.
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb
      .from('seo_ranks')
      .upsert(chunk, { onConflict: 'day,market,term,domain' });
    if (error) {
      console.error(`Upsert failed for chunk ${i / 200}: ${error.message}`);
      failures.push({ market: '-', term: `chunk ${i / 200}`, error: error.message });
    } else {
      written += chunk.length;
    }
  }

  console.log(`\nWrote ${written}/${rows.length} rows for ${DAY}.`);
  if (failures.length) {
    console.log(`${failures.length} failure(s):`);
    for (const f of failures) console.log(`  ${f.market} ${f.term}: ${f.error}`);
    process.exit(1); // partial success is still a non-zero exit so cron logs it
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
