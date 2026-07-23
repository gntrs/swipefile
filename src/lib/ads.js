import { db } from './db.js';

// Star lives in the ads.metrics jsonb (metrics.starred) rather than its own
// column, so it works with zero schema migration - and the daily importers
// already merge metrics ({...old, ...new}) on refresh, so a star survives a
// re-import. Team-wide (this is a shared internal tool).
export async function setStarred(ad, starred) {
  const metrics = { ...(ad.metrics || {}), starred };
  const { error } = await db.from('ads').update({ metrics }).eq('id', ad.id);
  if (error) console.warn('[star] update failed:', error.message);
  return !error;
}

export const isStarred = (a) => Boolean(a?.metrics?.starred);

// The newest swipe batch, tagged by scripts/flag-recent.mjs. It marks one batch
// at a time: the next upload clears the tag off the previous one, so "recent"
// means "from the last drop", not "added within N days".
export const RECENT_TAG = 'recently-added';
export const isRecent = (a) => Array.isArray(a?.tags) && a.tags.includes(RECENT_TAG);

// Proven = a human called it a winner, or the brand paid to run it 30+ days
// (the auto-verdict threshold). Same rule the hook bank and importers use.
export const isProven = (a) => a?.verdict === 'winner' || (a?.metrics?.days_running ?? 0) >= 30;

/* -------------------------------------------------------------------------
   Geo
   The geo columns (geo_status / countries / eu_reach / geo_synced_at) are
   populated by scripts/sync-geo.mjs from the EU ad-transparency payload, so
   every reader below tolerates them being missing entirely - the UI hides its
   geo controls until the sync has actually run.
   ------------------------------------------------------------------------- */

// Meta only publishes per-country reach for ads served in the EU. So:
//   eu      - the ad has EU transparency data, countries are known
//   none    - checked, and the ad is confirmed NOT running in the EU
//   unknown - never checked (or the lookup failed). Absence of data, not data.
export const GEO_STATUS = [
  { id: 'eu', label: 'EU data' },
  { id: 'none', label: 'Not EU' },
  { id: 'unknown', label: 'Unchecked' },
];

export const geoStatus = (a) => a?.geo_status || a?.metrics?.geo_status || 'unknown';

// ISO-3166 alpha-2, uppercased and de-duped. Falls back to metrics.countries so
// rows imported before the column existed still filter.
export function adCountries(a) {
  const raw = Array.isArray(a?.countries) ? a.countries : a?.metrics?.countries;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    const code = String(c || '').trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

// Only the codes the owner is likely to see. Anything unmapped just shows its
// ISO code, which is still readable - no need to ship a 250-entry table.
const COUNTRY_NAMES = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', CH: 'Switzerland', CY: 'Cyprus',
  CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', EE: 'Estonia', ES: 'Spain',
  FI: 'Finland', FR: 'France', GB: 'UK', GR: 'Greece', HR: 'Croatia',
  HU: 'Hungary', IE: 'Ireland', IT: 'Italy', LT: 'Lithuania', LU: 'Luxembourg',
  LV: 'Latvia', MT: 'Malta', NL: 'Netherlands', NO: 'Norway', PL: 'Poland',
  PT: 'Portugal', RO: 'Romania', SE: 'Sweden', SI: 'Slovenia', SK: 'Slovakia',
  US: 'United States',
};
export const countryName = (code) => COUNTRY_NAMES[code] || code;

// The expansion markets. Pinned to the top of the country picker so they are
// one tap away, but never invented: a pinned code only appears if ads exist.
export const FOCUS_COUNTRIES = ['ES', 'FR'];

// Country options derived from the data, so the control stays empty (and the
// UI hides it) until sync-geo has populated something. Focus markets first,
// then the rest by how many ads run there.
export function countryOptions(ads) {
  const counts = new Map();
  for (const a of ads || []) for (const c of adCountries(a)) counts.set(c, (counts.get(c) || 0) + 1);
  const rest = [...counts.keys()]
    .filter((c) => !FOCUS_COUNTRIES.includes(c))
    .sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
  const order = [...FOCUS_COUNTRIES.filter((c) => counts.has(c)), ...rest];
  return order.map((code) => ({ code, label: countryName(code), count: counts.get(code) }));
}

// EU-only reach, i.e. how many people in the EU this ad actually reached.
export function euReach(ad) {
  const v = Number(ad?.eu_reach ?? ad?.metrics?.eu_reach);
  return Number.isFinite(v) && v > 0 ? v : null;
}

// Same "4.1k" shape as fmtReach, so the two read as one metric family.
export function fmtEuReach(ad) {
  const r = euReach(ad);
  if (!r) return '';
  return r >= 1000 ? `${(r / 1000).toFixed(1)}k` : String(r);
}

/* -------------------------------------------------------------------------
   Verdicts - THE one place the rules live
   Both the UI and scripts/rescore-verdicts.mjs call scoreVerdict(), so a
   threshold is never tuned in two files. Cutoffs are justified against the
   actual 2,690-row distribution; see the comments on each branch.
   ------------------------------------------------------------------------- */

const DAY_MS = 86400000;
const daysSince = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / DAY_MS) : null;
};

// Thresholds, named so the script can print them.
export const VERDICT_RULES = {
  STALE_SYNC_DAYS: 45, // evidence older than this is not evidence
  LIVE_WINNER_DAYS: 60, // live this long = top ~20% of the corpus
  DEAD_WINNER_DAYS: 90, // ran a quarter, then got retired
  DEAD_LOSER_DAYS: 21, // killed before it left the learning phase
  DEAD_STALE_END_DAYS: 180, // finished so long ago the win no longer transfers
  OWN_MIN_SPEND: 25, // below this you cannot read an own ad at all
  OWN_KILL_SPEND: 50, // enough budget that a bad number is the ad's fault
  OWN_GOOD_CTR: 5,
  OWN_BAD_CTR: 1.5,
  OWN_GOOD_ROAS: 1.5,
  OWN_BAD_ROAS: 0.8,
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// True when the ad carries real spend data (own ads imported from the Meta CSV)
// - those get judged on money, never on how long they ran.
export const hasPerformance = (ad) => (num(ad?.metrics?.spend) ?? 0) > 0;

// The single source of truth. Returns { verdict, reason } - the reason string is
// what the rescore script prints so a cutoff is auditable, not magic.
export function scoreVerdict(ad) {
  const m = ad?.metrics || {};
  const R = VERDICT_RULES;

  // --- own ads: money beats duration -------------------------------------
  if (hasPerformance(ad)) {
    const spend = num(m.spend) || 0;
    const roas = num(m.roas);
    const ctr = num(m.ctr);
    if (spend < R.OWN_MIN_SPEND)
      return { verdict: 'testing', reason: `own ad, only €${spend.toFixed(0)} spent - no read yet` };
    if (roas != null && roas > 0) {
      if (roas >= R.OWN_GOOD_ROAS) return { verdict: 'winner', reason: `own ad, ROAS ${roas.toFixed(2)}` };
      if (roas < R.OWN_BAD_ROAS && spend >= R.OWN_KILL_SPEND)
        return { verdict: 'loser', reason: `own ad, ROAS ${roas.toFixed(2)} on €${spend.toFixed(0)}` };
      return { verdict: 'testing', reason: `own ad, ROAS ${roas.toFixed(2)} inconclusive` };
    }
    // No revenue tracked: CTR is the only honest proxy for "the algo liked it".
    if (ctr == null) return { verdict: 'unsure', reason: `own ad, €${spend.toFixed(0)} spent but no CTR` };
    if (ctr >= R.OWN_GOOD_CTR) return { verdict: 'winner', reason: `own ad, ${ctr.toFixed(2)}% CTR (no revenue data)` };
    if (ctr < R.OWN_BAD_CTR) return { verdict: 'loser', reason: `own ad, ${ctr.toFixed(2)}% CTR on €${spend.toFixed(0)}` };
    return { verdict: 'testing', reason: `own ad, ${ctr.toFixed(2)}% CTR (no revenue data)` };
  }

  // --- competitor ads: duration + liveness + freshness --------------------
  const days = num(m.days_running);
  if (days == null) return { verdict: 'unsure', reason: 'no run-length data' };

  // A verdict is only as fresh as the scrape behind it. Everything currently in
  // the table synced within 30 days, so this demotes nothing today - it stops
  // the library rotting silently if a sync ever stalls.
  const syncAge = daysSince(m.last_synced);
  if (syncAge != null && syncAge > R.STALE_SYNC_DAYS)
    return { verdict: 'unsure', reason: `last synced ${syncAge}d ago - stale` };

  const live = typeof m.live === 'boolean' ? m.live : ad?.status === 'running';

  if (live) {
    // Still paying after 60 days is the strongest signal available without
    // spend data: Meta kills unprofitable ads fast, so survival is the proof.
    if (days >= R.LIVE_WINNER_DAYS) return { verdict: 'winner', reason: `live ${days}d` };
    return { verdict: 'testing', reason: `live ${days}d - not proven yet` };
  }

  // Dead. When it stopped matters as much as how long it ran.
  const startAge = daysSince(m.started_running);
  const endedAgo = startAge != null ? Math.max(0, startAge - days) : null;

  if (days >= R.DEAD_WINNER_DAYS) {
    if (endedAgo != null && endedAgo > R.DEAD_STALE_END_DAYS)
      return { verdict: 'unsure', reason: `ran ${days}d but ended ${endedAgo}d ago - stale win` };
    return { verdict: 'winner', reason: `ran ${days}d then retired` };
  }
  if (days < R.DEAD_LOSER_DAYS) return { verdict: 'loser', reason: `killed after ${days}d` };
  return { verdict: 'unsure', reason: `ran ${days}d then stopped` };
}

// Thin wrapper for callers that only want the label.
export const autoVerdict = (ad) => scoreVerdict(ad).verdict;

// What each importer writes as its verdict when it has nothing to score on.
// Used to tell "the script set this" apart from "a human changed it": the
// importers already treat `verdict === (auto_verdict || default)` as untouched.
export const IMPORT_DEFAULT_VERDICT = {
  'foreplay@import': 'unsure',
  'adlib@import': 'unsure',
  'csv@import': 'testing',
  'meta@import': 'testing',
};

// True when nobody has hand-edited this verdict, i.e. it is safe to recompute.
// metrics.auto_verdict is the last value an importer wrote; the importers only
// advance ads.verdict while it still equals that value, so verdict !== auto
// means a human moved it. Rows with no auto_verdict at all are only safe if an
// importer created them (then verdict is still that importer's default) - a
// hand-added row is left alone.
export function isAutoVerdict(ad) {
  const last = ad?.metrics?.auto_verdict;
  if (last) return ad?.verdict === last;
  const fallback = IMPORT_DEFAULT_VERDICT[ad?.added_by_email];
  return fallback ? ad?.verdict === fallback : false;
}

// Reach rating: one glanceable AMAZING / GOOD / BAD verdict on a card, so you
// can read "is this ad working" without parsing numbers. Blends reach (how many
// humans saw it) with CTR (how hard it pulled) - a big reach that nobody clicks
// is not amazing. Returns null when the ad has no performance data at all (most
// competitor / Ad-Library rows), so those cards just fall back to days-running.
export function reachRating(ad) {
  const m = ad?.metrics || {};
  const reach = +m.reach || 0;
  const ctr = +m.ctr || 0;
  if (!reach && !ctr) return null;
  if (ctr >= 5 || reach >= 3000) return { label: 'AMAZING', tone: 'bg-emerald-500 text-black' };
  if (ctr >= 2 || reach >= 800) return { label: 'GOOD', tone: 'bg-amber-400 text-black' };
  return { label: 'BAD', tone: 'bg-rose-500 text-white' };
}

// Short human reach, e.g. 4125 -> "4.1k". Empty string when unknown.
export function fmtReach(ad) {
  const r = +(ad?.metrics?.reach) || 0;
  if (!r) return '';
  return r >= 1000 ? `${(r / 1000).toFixed(1)}k` : String(r);
}

// Where "see the actual creative" points. Deliberately NOT Foreplay - if the
// team pasted a real ad link (Ad Library / post url) we use that, otherwise we
// send them to a Meta Ad Library keyword search on the brand. Never leaks the
// foreplay_url even though it exists in metrics.
export function creativeLink(ad) {
  const m = ad?.metrics || {};
  if (m.source_url) return m.source_url;
  const q = encodeURIComponent(ad?.brand || ad?.hook || '');
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${q}&search_type=keyword_unordered`;
}
