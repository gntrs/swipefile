// The numbers behind the Competitors page, the rival detail page and the
// dashboard's competitor panel. Pure: `now` is always passed in, so every rule
// here is tested against a fixed clock.
//
// Time travel: an ad's start and stop dates (from the Ad Library import) are
// enough to say whether it was running on any past day. Every "then" number
// here is rebuilt from those dates, never from a stored snapshot.

import { angleOf, angleLabel } from './angles.js';
import { adCountries, countryName, geoStatus, VERDICT_RULES } from './ads.js';
import { isRunning, isWinner } from './dashboard.js';
import { deltaOf, inWindow, rollingWindows, toMs } from './periods.js';

const DAY = 86400000;
const LIVE_DAYS = VERDICT_RULES.LIVE_WINNER_DAYS;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const brandOf = (ad) => (typeof ad?.brand === 'string' ? ad.brand.trim() : '');
const ownTest = (isOwn) => (typeof isOwn === 'function' ? isOwn : () => false);
const nowOf = (now) => {
  const t = toMs(now);
  return t === null ? Date.now() : t;
};

// 'Kettle & Kite' -> 'kettle-and-kite'. The same rule the demo seed uses for
// its landing urls. '' for anything without letters or digits.
export function brandSlug(name) {
  if (typeof name !== 'string') return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Rival ads only: a brand that is not blank and not ours, one row per id
// (first one wins). Rows without an id are kept, rows that are not objects
// are dropped. The input is never changed.
export function rivalAds(ads, isOwn) {
  if (!Array.isArray(ads)) return [];
  const own = ownTest(isOwn);
  const seen = new Set();
  const out = [];
  for (const ad of ads) {
    if (!ad || typeof ad !== 'object') continue;
    const brand = brandOf(ad);
    if (!brand || own(brand)) continue;
    if (ad.id != null) {
      if (seen.has(ad.id)) continue;
      seen.add(ad.id);
    }
    out.push(ad);
  }
  return out;
}

// When the ad ran, in ms: { start, end }, end null while it is live. A stored
// stop date wins; else a stopped ad ends days_running days after its start.
// null when there is no start date, or a stopped ad has no way to place its end.
export function activityWindow(ad) {
  const m = ad?.metrics;
  if (!m || typeof m !== 'object') return null;
  const start = toMs(m.started_running);
  if (start === null) return null;
  const stopped = toMs(m.stopped_running);
  if (stopped !== null) return { start, end: Math.max(start, stopped) };
  if (isRunning(ad)) return { start, end: null };
  const days = Number(m.days_running);
  if (m.days_running === null || m.days_running === undefined || !Number.isFinite(days) || days < 0) return null;
  return { start, end: start + days * DAY };
}

// Was the ad running at time t: from its start (included) to its end (not
// included). null when the ad has no window or t is not a time.
export function runningAt(ad, t) {
  const w = activityWindow(ad);
  const at = toMs(t);
  if (!w || at === null) return null;
  return at >= w.start && (w.end === null || at < w.end);
}

// Whole days the ad had run by time t. 0 before it started. null with no window.
export function daysLiveAt(ad, t) {
  const w = activityWindow(ad);
  const at = toMs(t);
  if (!w || at === null) return null;
  const stop = w.end === null ? at : Math.min(w.end, at);
  return Math.max(0, Math.floor((stop - w.start) / DAY));
}

// Running right now: the live flag, unless the start date is still ahead.
const runningNow = (ad, now) => {
  if (!isRunning(ad)) return false;
  const w = activityWindow(ad);
  return !w || w.start <= now;
};

// Days an ad has run as far as we know: rebuilt from its dates when it has
// them, else the importer's days_running.
const runDays = (ad, now) => {
  const d = now === undefined ? null : daysLiveAt(ad, now);
  if (d !== null) return d;
  const n = Number(ad?.metrics?.days_running);
  return ad?.metrics?.days_running != null && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

const sameBrand = (brand) => {
  if (brand === undefined || brand === null || brand === '') return () => true;
  const slug = brandSlug(String(brand));
  return (ad) => brandSlug(brandOf(ad)) === slug;
};

// The four rival numbers, now against the same window one period back.
// running.value counts every live ad; the delta is rebuilt from start and stop
// dates only, so it leaves out live ads with no start date (undatedRunning).
// When those are more than a tenth of the live ads the change is not
// comparable and the delta is null.
export function rivalKpis(ads, { isOwn, now, days = 30 } = {}) {
  const t = nowOf(now);
  const span = finite(days) && days > 0 ? days : 30;
  const w = rollingWindows(span, t);
  const then = t - span * DAY;
  const rivals = rivalAds(ads, isOwn);

  let value = 0;
  let undatedRunning = 0;
  let dated = 0;
  let prev = 0;
  let launched = 0;
  let launchedPrev = 0;
  let launchedLive = 0;
  let proven = 0;
  let provenPrev = 0;
  let stopped = 0;
  let stoppedPrev = 0;
  const brands = new Set();
  const brandsRunning = new Set();

  for (const ad of rivals) {
    const key = brandSlug(brandOf(ad));
    brands.add(key);
    const live = runningNow(ad, t);
    const win = activityWindow(ad);
    if (live) {
      value += 1;
      brandsRunning.add(key);
    }
    if (!win) {
      if (live) undatedRunning += 1;
      continue;
    }
    dated += 1;
    if (runningAt(ad, then)) prev += 1;
    if (inWindow(win.start, w.cur)) {
      launched += 1;
      if (live) launchedLive += 1;
    }
    if (inWindow(win.start, w.prev)) launchedPrev += 1;
    if (live && daysLiveAt(ad, t) >= LIVE_DAYS) proven += 1;
    if (runningAt(ad, then) && daysLiveAt(ad, then) >= LIVE_DAYS) provenPrev += 1;
    if (win.end !== null) {
      if (inWindow(win.end, w.cur)) stopped += 1;
      if (inWindow(win.end, w.prev)) stoppedPrev += 1;
    }
  }

  const comparable = dated > 0 && (value === 0 || undatedRunning / value <= 0.1);
  return {
    running: {
      value,
      prev,
      delta: comparable ? deltaOf(value - undatedRunning, prev) : null,
      dated,
      undatedRunning,
      comparable,
    },
    launched: { value: launched, prev: launchedPrev, delta: dated ? deltaOf(launched, launchedPrev) : null, live: launchedLive },
    provenLive: { value: proven, prev: provenPrev, delta: dated ? deltaOf(proven, provenPrev) : null },
    stopped: { value: stopped, prev: stoppedPrev, delta: dated ? deltaOf(stopped, stoppedPrev) : null },
    brands: brands.size,
    brandsRunning: brandsRunning.size,
  };
}

function sampleRunning(ads, { isOwn, brand, times }) {
  const rivals = rivalAds(ads, isOwn).filter(sameBrand(brand));
  return times.map((at) => rivals.reduce((n, ad) => n + (runningAt(ad, at) ? 1 : 0), 0));
}

// Rival ads running on each of the last `days` days, sampled at the same time
// of day as now, oldest first. The last point is now. Ads without a start date
// are left out (they cannot be placed in time).
export function dailyRunning(ads, { isOwn, now, days = 90, brand } = {}) {
  const t = nowOf(now);
  const n = Number.isInteger(days) && days > 0 ? days : 90;
  const times = Array.from({ length: n }, (_, i) => t - (n - 1 - i) * DAY);
  const values = sampleRunning(ads, { isOwn, brand, times });
  return times.map((at, i) => ({ day: dayKey(at), value: values[i] }));
}

// The same, once a week: sampled at now - k * 7 days, the last one is now.
export function weeklyRunning(ads, { isOwn, now, weeks = 12, brand } = {}) {
  const t = nowOf(now);
  const n = Number.isInteger(weeks) && weeks > 0 ? weeks : 12;
  const times = Array.from({ length: n }, (_, i) => t - (n - 1 - i) * 7 * DAY);
  const values = sampleRunning(ads, { isOwn, brand, times });
  return times.map((at, i) => ({ weekEnd: dayKey(at), value: values[i] }));
}

// One row per rival brand. quiet: nothing running now, something running one
// period back. max: the largest weekly value across every row, the shared
// scale for the heat strips.
export function rivalBoard(ads, { isOwn, now, weeks = 12, days = 30 } = {}) {
  const t = nowOf(now);
  const rivals = rivalAds(ads, isOwn);
  const groups = new Map();
  for (const ad of rivals) {
    const key = brandSlug(brandOf(ad));
    if (!groups.has(key)) groups.set(key, { brand: brandOf(ad), ads: [] });
    groups.get(key).ads.push(ad);
  }
  let max = 0;
  const rows = [...groups.entries()].map(([slug, g]) => {
    const k = rivalKpis(g.ads, { now: t, days });
    const weekly = weeklyRunning(g.ads, { now: t, weeks }).map((p) => p.value);
    for (const v of weekly) if (v > max) max = v;
    let lastSeen = null;
    for (const ad of g.ads) {
      const w = activityWindow(ad);
      const seen = runningNow(ad, t) ? t : w?.end ?? toMs(ad.created_at);
      if (seen !== null && seen !== undefined && (lastSeen === null || seen > lastSeen)) lastSeen = Math.min(seen, t);
    }
    return {
      brand: g.brand,
      slug,
      running: k.running.value,
      runningPrev: k.running.prev,
      delta: k.running.delta,
      launched: k.launched.value,
      provenLive: k.provenLive.value,
      winners: g.ads.filter(isWinner).length,
      total: g.ads.length,
      lastSeen,
      weeks: k.running.dated ? weekly : null,
      dated: k.running.dated,
      quiet: k.running.value === 0 && k.running.prev > 0,
    };
  });
  rows.sort(
    (a, b) => b.running - a.running || b.launched - a.launched || a.brand.localeCompare(b.brand),
  );
  return { rows, max };
}

const limitTo = (list, limit) => (Number.isInteger(limit) && limit >= 0 ? list.slice(0, limit) : list);

// Rival ads that started in the last `days` days, newest start first.
export function newPlays(ads, { isOwn, now, days = 30, liveOnly = false, limit } = {}) {
  const t = nowOf(now);
  const w = rollingWindows(finite(days) && days > 0 ? days : 30, t);
  const out = [];
  for (const ad of rivalAds(ads, isOwn)) {
    const win = activityWindow(ad);
    if (!win || !inWindow(win.start, w.cur)) continue;
    const live = runningNow(ad, t);
    if (liveOnly && !live) continue;
    out.push({ ad, start: win.start, startedDaysAgo: Math.floor((t - win.start) / DAY), live });
  }
  out.sort((a, b) => b.start - a.start);
  return limitTo(out.map(({ ad, startedDaysAgo, live }) => ({ ad, startedDaysAgo, live })), limit);
}

const hookKey = (ad) =>
  `${brandSlug(brandOf(ad))}|${String(ad?.hook || '').trim().toLowerCase() || `#${ad?.id ?? ''}`}`;

// Keep the longest run per brand plus hook. Ties keep the first row seen.
function dedupe(list) {
  const best = new Map();
  for (const row of list) {
    const key = hookKey(row.ad);
    const cur = best.get(key);
    if (!cur || row.days > cur.days) best.set(key, row);
  }
  return [...best.values()];
}

// Live rival ads that have run `minDays` or more, longest first. newlyProven:
// crossed the line in the last 30 days.
export function provenPlays(ads, { isOwn, now, minDays = LIVE_DAYS, limit } = {}) {
  const t = nowOf(now);
  const min = finite(minDays) && minDays >= 0 ? minDays : LIVE_DAYS;
  const rows = [];
  for (const ad of rivalAds(ads, isOwn)) {
    if (!runningNow(ad, t)) continue;
    const days = runDays(ad, t);
    if (days === null || days < min) continue;
    rows.push({ ad, days, newlyProven: days < min + 30 });
  }
  const out = dedupe(rows).sort((a, b) => b.days - a.days);
  return limitTo(out, limit);
}

// The longest runs on record, from the importer's days_running. filter: 'all',
// 'live' or 'stopped'.
export function longestRuns(ads, { isOwn, filter = 'all', limit = 8 } = {}) {
  const rows = [];
  for (const ad of rivalAds(ads, isOwn)) {
    const days = runDays(ad);
    if (days === null || days <= 0) continue;
    const live = isRunning(ad);
    if (filter === 'live' && !live) continue;
    if (filter === 'stopped' && live) continue;
    rows.push({ ad, days, live });
  }
  return limitTo(dedupe(rows).sort((a, b) => b.days - a.days), limit);
}

// Count per key, largest first, then by label.
function tally(list, keyOf, labelOf) {
  const counts = new Map();
  let none = 0;
  for (const ad of list) {
    const id = keyOf(ad);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
    else none += 1;
  }
  const rows = [...counts.entries()]
    .map(([id, count]) => ({ id, label: labelOf(id), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { rows, none, total: list.length };
}

// Which ads a set means. 'running': live now. 'new': started in the last 30
// days. 'ran30': ran 30 days or more. 'all': every rival ad.
function adsInSet(ads, set, now) {
  if (set === 'all') return ads;
  if (set === 'new') {
    const w = rollingWindows(30, now);
    return ads.filter((ad) => {
      const win = activityWindow(ad);
      return win && inWindow(win.start, w.cur);
    });
  }
  if (set === 'ran30') return ads.filter((ad) => (runDays(ad, now) ?? 0) >= 30);
  return ads.filter((ad) => runningNow(ad, now));
}

export function angleMix(ads, { isOwn, now, set = 'running' } = {}) {
  const t = nowOf(now);
  return tally(adsInSet(rivalAds(ads, isOwn), set, t), angleOf, angleLabel);
}

const FORMAT_LABELS = { image: 'Image', video: 'Video', carousel: 'Carousel' };
const formatOf = (ad) => (typeof ad?.format === 'string' && ad.format.trim() ? ad.format.trim().toLowerCase() : null);
const formatLabel = (id) => FORMAT_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1);

// Everything the rival page shows for one brand. null for an unknown slug.
export function rivalDetail(ads, slug, { isOwn, now } = {}) {
  if (typeof slug !== 'string' || !slug) return null;
  const t = nowOf(now);
  const mine = rivalAds(ads, isOwn).filter((ad) => brandSlug(brandOf(ad)) === slug);
  if (!mine.length) return null;
  const sorted = [...mine].sort((a, b) => (toMs(b.created_at) ?? 0) - (toMs(a.created_at) ?? 0));

  const counts = new Map();
  let withData = 0;
  for (const ad of mine) {
    if (geoStatus(ad) === 'eu') withData += 1;
    for (const code of adCountries(ad)) counts.set(code, (counts.get(code) || 0) + 1);
  }
  const countryRows = [...counts.entries()]
    .map(([code, count], order) => ({ code, label: countryName(code), count, order }))
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ code, label, count }) => ({ code, label, count }));

  return {
    brand: brandOf(mine[0]),
    slug,
    ads: sorted,
    kpis: { ...rivalKpis(mine, { now: t }), winners: mine.filter(isWinner).length },
    daily: dailyRunning(mine, { now: t }),
    longest: longestRuns(mine, { limit: 5 }),
    fresh: newPlays(mine, { now: t }),
    angles: angleMix(mine, { now: t, set: 'all' }),
    formats: tally(mine, formatOf, formatLabel),
    countries: { rows: countryRows, withData, total: mine.length },
  };
}
