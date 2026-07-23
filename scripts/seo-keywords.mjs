// Shared keyword config for scripts/seo-rank-pull.mjs and scripts/trends-pull.mjs.
//
// Two DIFFERENT lists because they measure different things:
//
// - SEO_TERMS: long-tail, high-intent queries - the literal thing your target
//   customer types before they buy anything. Low volume is fine - Brave will
//   still return a ranked SERP for these searches.
//
// - TRENDS_GROUPS: head terms only. Google Trends silently returns all-zero
//   series below a volume threshold, which puts long-tail SEO_TERMS below it.
//   Charting those means charting nothing. Trends tracks demand for the
//   CATEGORY (is interest in your space rising in a market?), not for
//   specific queries.
//
// Write terms the way your CUSTOMER phrases the problem, not the way a
// marketer would. Think "how do I fix X" rather than "X remediation platform".

// Tiny .env loader (no dotenv dep). Runs here because this module is imported
// before the consumer scripts' own loaders get a chance to run.
import fs from 'node:fs';
import path from 'node:path';
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// Your own site. Rank is measured for this domain. Required for seo-rank-pull.
export const OUR_DOMAIN = (process.env.SEO_OWN_DOMAIN || '').trim();

// Competitor domains, comma-separated in SEO_COMPETITOR_DOMAINS. Position is
// recorded for the SAME SERP - "we are #14" is meaningless without knowing a
// competitor is #2.
export const COMPETITOR_DOMAINS = (process.env.SEO_COMPETITOR_DOMAINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ---------------------------------------------------------------- SEO terms
// market = Brave `country` param, lang = `search_lang`.
//
// Track each market you sell in separately - even same-language markets have
// their own index and their own SERP, so mixing them would silently average
// two different truths into one line.
//
// `tier` exists because Brave's free plan caps requests per month TOTAL and
// other scrapers draw from the same bucket. One request per term per run:
//   tier 1 = terms you actively compete on, pulled every run (daily)
//   tier 2 = watchlist terms, pulled Mondays only (or with --all)
//
// EDIT THIS LIST for your own niche. The entries below are placeholders that
// show the shape - replace every term before relying on the data.
export const SEO_TERMS = [
  // --- US (English) ------------------------------------------------------
  { market: 'US', lang: 'en', tier: 1, term: 'best example product for beginners' },
  { market: 'US', lang: 'en', tier: 1, term: 'how to solve example problem' },
  { market: 'US', lang: 'en', tier: 2, term: 'example competitor alternative' },
  { market: 'US', lang: 'en', tier: 2, term: 'example competitor review' },

  // --- GB (United Kingdom) - own SERP even for shared vocabulary ---------
  { market: 'GB', lang: 'en', tier: 1, term: 'best example product uk' },
  { market: 'GB', lang: 'en', tier: 2, term: 'example competitor alternative uk' },

  // --- Add more markets as you expand (ES, FR, DE, ...) ------------------
  // { market: 'ES', lang: 'es', tier: 1, term: 'your localized query here' },
];

// ------------------------------------------------------------ Trends groups
// Max 5 terms per group (Google compares within a group and rescales).
// key must be stable - it is the series id in the DB.
// EDIT for your niche; placeholders below show the shape.
export const TRENDS_GROUPS = [
  {
    geo: 'US',
    key: 'us-core',
    terms: ['example category', 'example problem', 'example solution type'],
  },
  {
    geo: 'GB',
    key: 'gb-core',
    terms: ['example category', 'example problem', 'example solution type'],
  },
  {
    geo: 'US',
    key: 'us-brand',
    terms: ['your brand', 'competitor brand'],
  },
];

export const TIMEFRAME = 'today 12-m';
