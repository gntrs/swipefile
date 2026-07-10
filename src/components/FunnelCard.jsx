import React, { useEffect, useMemo, useState } from 'react';
import { fetchAll } from '@/lib/supabase';

// Site funnel + traffic, read from kpi_snapshots (one row per day, written by
// scripts/snapshot-kpis.mjs from the daily PostHog pull - the browser can't
// reach PostHog directly). Sums the last N days for the funnel bars and plots
// visitors/day as a sparkline. Degrades to a quiet setup note when the table
// is empty (migration 16 not applied yet, or the cron hasn't run).

const WINDOW = 30;

// Funnel stages top to bottom, with human labels. Keyed by the raw event names
// snapshot-kpis.mjs stores, so relabeling here needs no data change.
const STAGES = [
  { key: 'landing_cta_clicked', label: 'Landing CTA' },
  { key: 'onboarding_started', label: 'Onboarding started' },
  { key: 'onboarding_completed', label: 'Onboarding done' },
  { key: 'user_registered', label: 'Registered' },
  { key: 'payment_initiated', label: 'Checkout started' },
  { key: 'payment_completed', label: 'Paid' },
];

const cutoff = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - WINDOW);
  return d.toISOString().slice(0, 10);
};

export default function FunnelCard() {
  const [rows, setRows] = useState(null); // null = loading, [] = empty/no table

  useEffect(() => {
    let mounted = true;
    fetchAll((q) => q.gte('day', cutoff()).order('day', { ascending: true }), 'kpi_snapshots')
      .then((data) => mounted && setRows(data))
      .catch(() => mounted && setRows([]));
    return () => {
      mounted = false;
    };
  }, []);

  const { funnel, spark, visitors, days } = useMemo(() => {
    const list = rows || [];
    const funnelTotals = Object.fromEntries(STAGES.map((s) => [s.key, 0]));
    let visitorsTotal = 0;
    const daily = [];
    for (const r of list) {
      const m = r.metrics || {};
      for (const s of STAGES) funnelTotals[s.key] += m.funnel?.[s.key] || 0;
      const v = m.traffic?.visitors || 0;
      visitorsTotal += v;
      daily.push(v);
    }
    const top = funnelTotals[STAGES[0].key] || Math.max(1, ...Object.values(funnelTotals));
    const funnelRows = STAGES.map((s, i) => {
      const value = funnelTotals[s.key];
      const prev = i === 0 ? null : funnelTotals[STAGES[i - 1].key];
      return {
        ...s,
        value,
        width: top ? (value / top) * 100 : 0,
        conv: prev ? (prev ? (value / prev) * 100 : 0) : null,
      };
    });
    return { funnel: funnelRows, spark: daily, visitors: visitorsTotal, days: list.length };
  }, [rows]);

  // Sparkline path over visitors/day.
  const sparkPath = useMemo(() => {
    if (spark.length < 2) return null;
    const w = 100;
    const h = 28;
    const max = Math.max(1, ...spark);
    const step = w / (spark.length - 1);
    const pts = spark.map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * h).toFixed(2)}`);
    return { line: `M${pts.join(' L')}`, area: `M0,${h} L${pts.join(' L')} L${w},${h} Z` };
  }, [spark]);

  return (
    <div className="bg-card rounded-xl3 border border-line shadow-card p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-[15px]">Site funnel</h2>
          <p className="text-ink-soft text-[12px]">
            Last {days || WINDOW} days{visitors ? ` · ${visitors.toLocaleString()} visitors` : ''}
          </p>
        </div>
        {sparkPath && (
          <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-28 h-8" aria-hidden="true">
            <path d={sparkPath.area} fill="rgba(255,255,255,0.08)" />
            <path d={sparkPath.line} fill="none" stroke="#FFFFFF" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>

      {rows === null ? (
        <p className="text-ink-soft text-[13px]">Loading...</p>
      ) : rows.length === 0 ? (
        <div className="text-[13px] text-ink-soft bg-cream/60 rounded-2xl px-4 py-3">
          No snapshots yet. Apply <span className="font-mono text-[12px]">supabase-migration-16.sql</span>,
          then the daily cron (or <span className="font-mono text-[12px]">node scripts/snapshot-kpis.mjs</span>)
          fills this in.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {funnel.map((s) => (
            <div key={s.key}>
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-[13px] font-medium">{s.label}</span>
                <span className="font-mono text-[12px] text-ink-soft tabular-nums flex-shrink-0">
                  {s.value.toLocaleString()}
                  {s.conv != null && (
                    <span className={`ml-1.5 font-semibold ${s.conv < 40 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {s.conv.toFixed(0)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-card overflow-hidden">
                <div
                  className="h-full rounded-full bg-coral"
                  style={{ width: `${Math.max(2, s.width)}%` }}
                />
              </div>
            </div>
          ))}
          <p className="text-[11px] text-ink-soft mt-1">
            % = conversion from the stage above. Red flags a leak under 40%.
          </p>
        </div>
      )}
    </div>
  );
}
