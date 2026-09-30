// The numbers behind the main dashboard, as one pure function so the page stays
// a layout and the rules can be tested without a browser.
import { angleOf, angleLabel } from './angles.js';

const DAY = 86400000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const createdAt = (ad) => {
  const t = Date.parse(ad?.created_at || '');
  return Number.isFinite(t) ? t : null;
};

// Live when the importer says so. A row with no live flag falls back to its
// status, the same rule the verdict scorer uses.
export const isRunning = (ad) => {
  const live = ad?.metrics?.live;
  return typeof live === 'boolean' ? live : ad?.status === 'running';
};

export const isWinner = (ad) => ad?.verdict === 'winner';

// One ad per id, first one wins, rows without an object dropped. A list that
// arrives twice (a retry, a realtime echo) never counts double.
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

// The short proof shown next to a winner: how long it ran, or what it returned.
export function winnerProof(ad) {
  const m = ad?.metrics || {};
  const days = num(m.days_running);
  if (days != null && days > 0) return isRunning(ad) ? `live ${days}d` : `ran ${days}d`;
  const roas = num(m.roas);
  if (roas != null && roas > 0) return `ROAS ${roas.toFixed(1)}`;
  const ctr = num(m.ctr);
  if (ctr != null && ctr > 0) return `CTR ${ctr.toFixed(1)}%`;
  return null;
}

// Winners that are still running first, then the longest runs, then own ads by
// return. Ties keep the newest first.
function rankWinners(a, b) {
  const la = isRunning(a) ? 1 : 0;
  const lb = isRunning(b) ? 1 : 0;
  if (la !== lb) return lb - la;
  const da = num(a.metrics?.days_running) ?? -1;
  const dbb = num(b.metrics?.days_running) ?? -1;
  if (da !== dbb) return dbb - da;
  const ra = num(a.metrics?.roas) ?? -1;
  const rb = num(b.metrics?.roas) ?? -1;
  if (ra !== rb) return rb - ra;
  return (createdAt(b) ?? 0) - (createdAt(a) ?? 0);
}

export function dashboardSummary(input, { now = Date.now(), isOwn = () => false, top = 5 } = {}) {
  const ads = clean(input);
  const weekAgo = now - 7 * DAY;
  const monthAgo = now - 30 * DAY;
  const isNew = (ad, since) => {
    const t = createdAt(ad);
    return t != null && t >= since && t <= now + DAY;
  };

  const winners = ads.filter(isWinner);

  const angleCounts = new Map();
  let noAngle = 0;
  for (const ad of winners) {
    const id = angleOf(ad);
    if (id) angleCounts.set(id, (angleCounts.get(id) || 0) + 1);
    else noAngle += 1;
  }
  const angles = [...angleCounts.entries()]
    .map(([id, count]) => ({ id, label: angleLabel(id), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const byBrand = new Map();
  for (const ad of ads) {
    const brand = String(ad.brand || '').trim();
    if (!brand || isOwn(brand)) continue;
    const row = byBrand.get(brand) || { brand, running: 0, fresh: 0, total: 0 };
    row.total += 1;
    if (isRunning(ad)) row.running += 1;
    if (isNew(ad, monthAgo)) row.fresh += 1;
    byBrand.set(brand, row);
  }
  const rivals = [...byBrand.values()]
    .filter((r) => r.running > 0 || r.fresh > 0)
    .sort((a, b) => b.running - a.running || b.fresh - a.fresh || a.brand.localeCompare(b.brand))
    .slice(0, top);

  return {
    total: ads.length,
    winners: winners.length,
    running: ads.filter(isRunning).length,
    newThisWeek: ads.filter((ad) => isNew(ad, weekAgo)).length,
    working: [...winners].sort(rankWinners).slice(0, top),
    angles,
    noAngle,
    rivals,
  };
}
