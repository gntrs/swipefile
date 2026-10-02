// The numbers behind the Insights page and the "Your insights" block of the
// dashboard: how your own ads did with the money, and what is working across
// the whole library. Pure, so every sum can be checked against the demo seed.
//
// Own ad numbers are running totals as imported from Meta. No history of them
// is kept, so nothing here compares periods for own ads.
import { ourPerformance, adClicks } from './performance.js';
import { VERDICT_RULES, reachRating, isStarred } from './ads.js';
import { angleOf, angleLabel } from './angles.js';
import { isRunning } from './dashboard.js';
import { rollingWindows, inWindow, deltaOf } from './periods.js';

// A number from a number or a numeric string. null for anything else,
// booleans and empty strings included.
const toNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

// One ad per id, first one wins, rows that are not objects dropped.
function clean(ads) {
  if (!Array.isArray(ads)) return [];
  const seen = new Set();
  const out = [];
  for (const ad of ads) {
    if (!ad || typeof ad !== 'object') continue;
    if (ad.id != null) {
      if (seen.has(ad.id)) continue;
      seen.add(ad.id);
    }
    out.push(ad);
  }
  return out;
}

const ownTest = (isOwn) => (typeof isOwn === 'function' ? isOwn : () => false);
const currencyOf = (ad) => {
  const c = ad?.metrics?.currency;
  return typeof c === 'string' && c.trim() ? c.trim().toLowerCase() : 'eur';
};

// The verdicts in the order every split is drawn in: winner, testing, loser,
// not judged. Anything else counts as not judged.
export const VERDICT_ORDER = ['winner', 'testing', 'loser', 'unsure'];
const VERDICT_TONE = { winner: 'good', testing: 'warn', loser: 'bad', unsure: 'neutral' };
const VERDICT_LABEL = { winner: 'Winners', testing: 'Testing', loser: 'Losers', unsure: 'Not judged' };
const verdictKey = (v) => (VERDICT_ORDER.includes(v) ? v : 'unsure');

// ROAS against the thresholds the verdict scorer already uses: 1.5 or more is
// Strong, 0.8 up to 1.5 is OK, under 0.8 is Weak.
export function roasBand(value) {
  const v = toNum(value);
  if (v === null || v < 0) return null;
  const { OWN_GOOD_ROAS: good, OWN_BAD_ROAS: bad } = VERDICT_RULES;
  if (v >= good) return { label: 'Strong', tone: 'good', basis: `ROAS ${good} or more` };
  if (v >= bad) return { label: 'OK', tone: 'neutral', basis: `ROAS ${bad} to ${good}` };
  return { label: 'Weak', tone: 'bad', basis: `ROAS under ${bad}` };
}

// CTR (a percent) against the reachRating rule: 5 or more Strong, 2 up to 5
// OK, under 2 Weak. null for no CTR or a CTR of 0.
export function ctrBand(value) {
  const v = toNum(value);
  if (v === null) return null;
  return reachRating({ metrics: { ctr: v } });
}

// The own ads that carry numbers, in the one currency the sums use. The
// currency is the one with the most spend; ads in any other currency are left
// out and counted, the rule revenueStats uses for sales.
function ownInCurrency(input, isOwn) {
  const own = ownTest(isOwn);
  const ads = clean(input).filter((a) => {
    if (!own(a.brand)) return false;
    const m = a.metrics || {};
    return toNum(m.spend) !== null || toNum(m.ctr) !== null;
  });
  const byCur = new Map();
  for (const a of ads) byCur.set(currencyOf(a), (byCur.get(currencyOf(a)) || 0) + Math.max(0, toNum(a.metrics?.spend) ?? 0));
  const currency = [...byCur.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || 'eur';
  const inCur = ads.filter((a) => currencyOf(a) === currency);
  return { currency, ads: inCur, otherCurrencyAds: ads.length - inCur.length };
}

// Spend, revenue, ROAS, CTR and CPC for a set of own ads, blended the way
// ourPerformance blends: each rate only over the ads that carry both halves of
// it. Revenue is spend times the imported ROAS. null where nothing is known.
function blend(ads) {
  let spend = null;
  let roasSpend = 0;
  let revenue = 0;
  let roasAds = 0;
  let ctrClicks = 0;
  let ctrImpr = 0;
  let cpcClicks = 0;
  let cpcSpend = 0;
  for (const a of ads) {
    const m = a.metrics || {};
    const s = toNum(m.spend);
    const r = toNum(m.roas);
    const impr = toNum(m.impressions);
    const clicks = adClicks(m);
    if (s !== null) spend = (spend ?? 0) + s;
    if (s !== null && s > 0 && r !== null && r >= 0) {
      roasSpend += s;
      revenue += s * r;
      roasAds += 1;
    }
    if (clicks != null && impr > 0) {
      ctrClicks += clicks;
      ctrImpr += impr;
    }
    if (clicks > 0 && s !== null) {
      cpcClicks += clicks;
      cpcSpend += s;
    }
  }
  return {
    ads: ads.length,
    spend,
    revenue: roasAds ? revenue : null,
    roas: roasSpend > 0 ? revenue / roasSpend : null,
    roasAds,
    roasSpend,
    ctr: ctrImpr > 0 ? (ctrClicks / ctrImpr) * 100 : null,
    cpc: cpcClicks > 0 ? cpcSpend / cpcClicks : null,
  };
}

// Everything the "Your ads" numbers need, in one pass. hasNumbers is true when
// at least one own ad carries spend.
export function ownAdsSummary(ads, { isOwn } = {}) {
  const own = ownTest(isOwn);
  const { currency, ads: list, otherCurrencyAds } = ownInCurrency(ads, own);
  const perf = ourPerformance(list, own);
  const b = blend(list);
  const roas = { value: b.roas, spend: b.roasSpend, revenue: b.revenue, ads: b.roasAds };

  const split = new Map(VERDICT_ORDER.map((v) => [v, { spend: 0, ads: 0 }]));
  for (const a of list) {
    const s = toNum(a.metrics?.spend);
    if (s === null || s <= 0) continue;
    const row = split.get(verdictKey(a.verdict));
    row.spend += s;
    row.ads += 1;
  }
  const spendSplit = VERDICT_ORDER.filter((v) => split.get(v).spend > 0).map((v) => ({
    verdict: v,
    tone: VERDICT_TONE[v],
    label: VERDICT_LABEL[v],
    spend: split.get(v).spend,
    ads: split.get(v).ads,
  }));

  return {
    ...perf,
    currency,
    otherCurrencyAds,
    hasNumbers: list.some((a) => (toNum(a.metrics?.spend) ?? 0) > 0),
    roas,
    roasBand: roasBand(b.roas),
    ctrBand: ctrBand(perf.blendedCtr),
    spendSplit,
  };
}

// Own winners against own losers, side by side.
export function winnerLoserCompare(ads, { isOwn } = {}) {
  const { ads: list } = ownInCurrency(ads, isOwn);
  const pick = (v) => {
    const { ads: n, spend, revenue, roas, ctr, cpc } = blend(list.filter((a) => a.verdict === v));
    return { ads: n, spend, revenue, roas, ctr, cpc };
  };
  return { winners: pick('winner'), losers: pick('loser') };
}

const KEYS = ['angle', 'format'];
const formatId = (ad) => {
  const f = typeof ad?.format === 'string' ? ad.format.trim().toLowerCase() : '';
  return f || null;
};
const formatLabel = (id) => (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'No format');
const groupId = (ad, key) => (key === 'angle' ? angleOf(ad) : formatId(ad));
const groupLabel = (id, key) => (key === 'angle' ? (id ? angleLabel(id) : 'No angle') : formatLabel(id));

// Your ads with numbers grouped by angle or format, one row per group, the
// most spend first. Ads with no angle or format share one row with id null.
export function groupOwnBy(ads, key, { isOwn } = {}) {
  if (!KEYS.includes(key)) return [];
  const { ads: list } = ownInCurrency(ads, isOwn);
  const groups = new Map();
  for (const a of list) {
    const id = groupId(a, key);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(a);
  }
  return [...groups.entries()]
    .map(([id, group]) => {
      const { ads: n, spend, ctr, cpc, roas } = blend(group);
      return { id, label: groupLabel(id, key), ads: n, spend, ctr, cpc, roas };
    })
    .sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1) || b.ads - a.ads || a.label.localeCompare(b.label));
}

// Winners across the whole library, own and rival, per angle or format. The
// angle rows match dashboardSummary().angles. none counts winners with no
// angle or format.
export function winnersBy(ads, key) {
  if (!KEYS.includes(key)) return { rows: [], none: 0 };
  const counts = new Map();
  let none = 0;
  for (const a of clean(ads)) {
    if (a.verdict !== 'winner') continue;
    const id = groupId(a, key);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
    else none += 1;
  }
  const rows = [...counts.entries()]
    .map(([id, count]) => ({ id, label: groupLabel(id, key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { rows, none };
}

// The whole library by verdict, as counts, in the split bar order. All four
// rows are always there, a zero included.
export function verdictSplit(ads) {
  const counts = new Map(VERDICT_ORDER.map((v) => [v, 0]));
  for (const a of clean(ads)) counts.set(verdictKey(a.verdict), counts.get(verdictKey(a.verdict)) + 1);
  return VERDICT_ORDER.map((v) => ({ verdict: v, tone: VERDICT_TONE[v], label: VERDICT_LABEL[v], count: counts.get(v) }));
}

// The library side of the key numbers, for when there are no own numbers:
// ads saved in the last `days` against the `days` before, winners and how many
// of them still run, starred, and ads with an angle. Winners, stars and angles
// carry no timestamp, so only the saved count has a change.
export function libraryCounts(ads, { now = Date.now(), days = 30 } = {}) {
  const list = clean(ads);
  const w = rollingWindows(days, now);
  const saved = w ? list.filter((a) => inWindow(a.created_at, w.cur)).length : null;
  const savedPrev = w ? list.filter((a) => inWindow(a.created_at, w.prev)).length : null;
  const winners = list.filter((a) => a.verdict === 'winner');
  return {
    total: list.length,
    saved: { value: saved, prev: savedPrev, delta: deltaOf(saved, savedPrev) },
    winners: winners.length,
    winnersLive: winners.filter(isRunning).length,
    starred: list.filter(isStarred).length,
    withAngle: list.filter((a) => angleOf(a)).length,
  };
}
