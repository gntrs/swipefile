// The numbers behind the Performance section: how our own ads did, and how
// many ads each rival is running. Pure, so the sums can be checked against the
// demo seed in a test.
import { isRunning } from './dashboard.js';

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Clicks for one ad: the stored count when the import has it, else CTR times
// impressions. null when neither can be known.
export function adClicks(m = {}) {
  const clicks = num(m.clicks);
  if (clicks != null && clicks >= 0) return clicks;
  const ctr = num(m.ctr);
  const impressions = num(m.impressions);
  if (ctr != null && impressions != null) return (ctr / 100) * impressions;
  return null;
}

// Our ads with numbers, biggest spend first, plus the blended totals. Every
// blended rate uses only the ads that carry both halves of it: CTR is clicks
// over impressions on ads that have both, CPC is spend over clicks on ads
// that have both. An ad with spend but no clicks never inflates CPC.
export function ourPerformance(ads, isOwn) {
  const rows = (Array.isArray(ads) ? ads : [])
    .filter((a) => a && isOwn(a.brand))
    .map((a) => {
      const m = a.metrics || {};
      return {
        id: a.id,
        name: m.ad_name || a.hook || 'Untitled',
        spend: num(m.spend),
        ctr: num(m.ctr),
        cpc: num(m.cpc),
        impressions: num(m.impressions),
        clicks: adClicks(m),
        verdict: a.verdict,
      };
    })
    .filter((r) => r.spend != null || r.ctr != null)
    .sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1));

  const totalSpend = rows.reduce((s, r) => s + (r.spend || 0), 0);

  const ctrRows = rows.filter((r) => r.clicks != null && r.impressions > 0);
  const ctrClicks = ctrRows.reduce((s, r) => s + r.clicks, 0);
  const ctrImpr = ctrRows.reduce((s, r) => s + r.impressions, 0);
  const blendedCtr = ctrImpr ? (ctrClicks / ctrImpr) * 100 : null;

  const cpcRows = rows.filter((r) => r.clicks > 0 && r.spend != null);
  const cpcClicks = cpcRows.reduce((s, r) => s + r.clicks, 0);
  const cpcSpend = cpcRows.reduce((s, r) => s + r.spend, 0);
  const blendedCpc = cpcClicks ? cpcSpend / cpcClicks : null;

  const withCtr = rows.filter((r) => r.ctr != null);
  const best = withCtr.length >= 2 ? [...withCtr].sort((a, b) => b.ctr - a.ctr)[0] : null;
  const maxCtr = withCtr.reduce((m, r) => Math.max(m, r.ctr), 0);

  return { rows, totalSpend, blendedCtr, blendedCpc, best, maxCtr, ctrAds: ctrRows.length, cpcAds: cpcRows.length };
}

// Rival brands by ads running now. Running uses the same rule as the rest of
// the app (the live flag first, then status). Proven means the ad has run 30
// days or more; a winner verdict alone does not count, so the label stays true.
export function rivalPressure(ads, isOwn, { top = 6 } = {}) {
  const byBrand = new Map();
  let running = 0;
  let proven = 0;
  for (const a of Array.isArray(ads) ? ads : []) {
    if (!a) continue;
    const brand = String(a.brand || '').trim();
    if (!brand || isOwn(brand)) continue;
    if (!byBrand.has(brand)) byBrand.set(brand, { brand, running: 0, proven: 0 });
    const r = byBrand.get(brand);
    const days = num(a.metrics?.days_running);
    if (isRunning(a)) {
      r.running += 1;
      running += 1;
    }
    if (days != null && days >= 30) {
      r.proven += 1;
      proven += 1;
    }
  }
  const brands = [...byBrand.values()]
    .filter((b) => b.running > 0)
    .sort((a, b) => b.running - a.running || b.proven - a.proven || a.brand.localeCompare(b.brand));
  return { top: brands.slice(0, top), more: Math.max(0, brands.length - top), running, proven };
}
