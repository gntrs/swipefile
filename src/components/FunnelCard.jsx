import React, { useEffect, useMemo, useState } from 'react';
import { fetchAll, isMissingTable } from '@/lib/db';
import PartialNotice from '@/components/PartialNotice';
import { parseFunnelStages, DEFAULT_FUNNEL_STAGES } from '@/lib/funnel';
import { RowsSkeleton } from '@/components/Skeleton';
import { Panel, Notice } from '@/components/ui';

// Site funnel + traffic, read from kpi_snapshots (one row per day, written by
// scripts/snapshot-kpis.mjs from the daily PostHog pull; the browser can't
// reach PostHog directly). Sums the last N days for the funnel bars and plots
// visitors/day as a sparkline. Degrades to a quiet setup note when the table
// is empty (migration 16 not applied yet, or the cron hasn't run).

const WINDOW = 30;

// Funnel stages top to bottom, with human labels, from VITE_FUNNEL_STAGES
// (see lib/funnel.js). Keyed by the raw event names snapshot-kpis.mjs stores,
// so relabeling needs no data change.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const STAGES = parseFunnelStages(env.VITE_FUNNEL_STAGES || DEFAULT_FUNNEL_STAGES);

const cutoff = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - WINDOW);
  return d.toISOString().slice(0, 10);
};

export default function FunnelCard() {
  const [rows, setRows] = useState(null); // null = loading, [] = empty/no table
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let mounted = true;
    fetchAll((q) => q.gte('day', cutoff()).order('day', { ascending: true }), 'kpi_snapshots')
      .then((data) => mounted && setRows(data))
      .catch(() => mounted && setRows([]));
    return () => {
      mounted = false;
    };
  }, [reload]);

  // A missing table is the setup note below, not a load failure.
  const partial = rows?.error && !isMissingTable(rows.error) ? rows : null;

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
    <Panel
      title="Site funnel"
      action={
        sparkPath && (
          <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-28 h-7 text-ink-soft" aria-hidden="true">
            <path d={sparkPath.area} fill="rgba(255,255,255,0.06)" />
            <path d={sparkPath.line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        )
      }
    >
      <p className="text-small text-ink-soft -mt-3 mb-5">
        Last {days || WINDOW} days{visitors ? ` · ${visitors.toLocaleString()} visitors` : ''}
      </p>

      <PartialNotice rows={partial} noun="days" onRetry={() => setReload((n) => n + 1)} className="mb-4" />
      {rows === null ? (
        <RowsSkeleton rows={2} className="!bg-transparent" />
      ) : rows.length === 0 ? (
        <Notice tone="info">
          No snapshots yet. Apply <code className="font-mono text-small">db-setup.sql</code>, then the daily cron (or{' '}
          <code className="font-mono text-small">node scripts/snapshot-kpis.mjs</code>) fills this in.
        </Notice>
      ) : (
        <>
          <ul className="flex flex-col gap-3.5">
            {funnel.map((s) => (
              <li key={s.key}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-ui font-medium text-ink">{s.label}</span>
                  <span className="flex items-baseline gap-3 flex-shrink-0">
                    <span className="num text-small text-ink">{s.value.toLocaleString()}</span>
                    {s.conv != null && (
                      <span className={`num text-small w-12 text-right ${s.conv < 40 ? 'text-red-300' : 'text-emerald-300'}`}>
                        {s.conv.toFixed(0)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-white/60" style={{ width: `${Math.max(2, s.width)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-small text-ink-soft mt-4">% = conversion from the stage above. Red flags a leak under 40%.</p>
        </>
      )}
    </Panel>
  );
}
