// Funnel stages for the Site funnel card (ops module). Set VITE_FUNNEL_STAGES
// to `event:Label` pairs, comma separated, in funnel order. The event names
// must match what scripts/snapshot-kpis.mjs stores (its FUNNEL_EVENTS).
import { dayWindows, deltaOf } from './periods.js';

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

// Site visits in the last `days` UTC days against the `days` before, from
// kpi_snapshots rows (metrics.traffic.visitors, one row per day). A day counts
// once, the first row for it wins. The change is only given when both windows
// have a snapshot on at least 24 of 30 days (the same share for other
// lengths), so a missing week never reads as a drop.
export function visitsWindow(rows, { now = Date.now(), days = 30 } = {}) {
  const w = dayWindows(days, now);
  const empty = { cur: 0, prev: 0, curDays: 0, prevDays: 0, comparable: false, delta: null };
  if (!w) return empty;
  const seen = new Set();
  const out = { ...empty };
  for (const r of Array.isArray(rows) ? rows : []) {
    const day = typeof r?.day === 'string' ? r.day.slice(0, 10) : null;
    if (!day || seen.has(day)) continue;
    const raw = r.metrics?.traffic?.visitors;
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    if (!Number.isFinite(v) || v < 0) continue;
    seen.add(day);
    if (day >= w.cur.from && day <= w.cur.to) {
      out.cur += v;
      out.curDays += 1;
    } else if (day >= w.prev.from && day <= w.prev.to) {
      out.prev += v;
      out.prevDays += 1;
    }
  }
  const need = Math.ceil(days * 0.8);
  out.comparable = out.curDays >= need && out.prevDays >= need;
  out.delta = out.comparable ? deltaOf(out.cur, out.prev, { polarity: 'up' }) : null;
  return out;
}
