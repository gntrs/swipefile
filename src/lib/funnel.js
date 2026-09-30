// Funnel stages for the Site funnel card (ops module). Set VITE_FUNNEL_STAGES
// to `event:Label` pairs, comma separated, in funnel order. The event names
// must match what scripts/snapshot-kpis.mjs stores (its FUNNEL_EVENTS).
export const DEFAULT_FUNNEL_STAGES =
  'landing_cta_clicked:Landing CTA,signup_started:Sign up started,signup_completed:Sign up done,user_registered:Registered,payment_initiated:Checkout started,payment_completed:Paid';

export function parseFunnelStages(raw) {
  const stages = [];
  for (const part of String(raw || '').split(',')) {
    const [key, ...rest] = part.split(':');
    const k = (key || '').trim();
    if (!k || stages.some((s) => s.key === k)) continue;
    stages.push({ key: k, label: rest.join(':').trim() || k });
  }
  return stages.length ? stages : parseFunnelStages(DEFAULT_FUNNEL_STAGES);
}

// The Site funnel card's numbers from kpi_snapshots rows (one per day). The
// stage values are event counts summed over the window, not unique people, so
// a step can pass 100 percent of the one above it; the card says so rather
// than capping it. `ofPrev` is null for the first stage and when the stage
// above has no events.
export function funnelSummary(rows, stages) {
  const list = Array.isArray(rows) ? rows : [];
  const totals = Object.fromEntries(stages.map((s) => [s.key, 0]));
  for (const r of list) {
    const f = r?.metrics?.funnel || {};
    for (const s of stages) {
      const v = Number(f[s.key]);
      if (Number.isFinite(v) && v > 0) totals[s.key] += v;
    }
  }
  const max = Math.max(0, ...stages.map((s) => totals[s.key]));
  return {
    max,
    days: list.length,
    stages: stages.map((s, i) => {
      const value = totals[s.key];
      const prev = i === 0 ? null : totals[stages[i - 1].key];
      return { ...s, value, ofPrev: prev ? (value / prev) * 100 : null };
    }),
  };
}

// First day of a window of `days` calendar days that ends today (UTC), so a
// 30 day window is today plus the 29 days before it.
export function windowStart(days, now = Date.now()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}
