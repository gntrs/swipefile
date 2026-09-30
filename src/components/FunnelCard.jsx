import React, { useEffect, useMemo, useState } from 'react';
import { fetchAll, isMissingTable } from '@/lib/db';
import PartialNotice from '@/components/PartialNotice';
import { parseFunnelStages, DEFAULT_FUNNEL_STAGES, funnelSummary, windowStart } from '@/lib/funnel';
import { dailySeries } from '@/lib/charts';
import { RowsSkeleton } from '@/components/Skeleton';
import { Panel, Notice } from '@/components/ui';
import BarList from '@/components/charts/BarList';
import LineChart from '@/components/charts/LineChart';

// Site funnel + traffic, read from kpi_snapshots (one row per day, written by
// scripts/snapshot-kpis.mjs from the daily PostHog pull; the browser can't
// reach PostHog directly). Sums the last WINDOW days for the funnel bars and
// draws visitors per day on a zero based line. Degrades to a quiet setup note
// when the table is empty (migration 16 not applied yet, or the cron hasn't
// run).
//
// The funnel numbers are event counts, not unique people: one person can fire
// a step twice, so a step can pass 100 percent of the one above it. Summed
// daily visitors count a returning person once per day they came back.

const WINDOW = 30;

// Funnel stages top to bottom, with human labels, from VITE_FUNNEL_STAGES
// (see lib/funnel.js). Keyed by the raw event names snapshot-kpis.mjs stores,
// so relabeling needs no data change.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const STAGES = parseFunnelStages(env.VITE_FUNNEL_STAGES || DEFAULT_FUNNEL_STAGES);

const pct = (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

export default function FunnelCard() {
  const [rows, setRows] = useState(null); // null = loading, [] = empty/no table
  const [reload, setReload] = useState(0);
  const from = windowStart(WINDOW);

  useEffect(() => {
    let mounted = true;
    fetchAll((q) => q.gte('day', from).order('day', { ascending: true }), 'kpi_snapshots')
      .then((data) => mounted && setRows(data))
      .catch(() => mounted && setRows([]));
    return () => {
      mounted = false;
    };
  }, [reload, from]);

  // A missing table is the setup note below, not a load failure.
  const partial = rows?.error && !isMissingTable(rows.error) ? rows : null;

  const funnel = useMemo(() => funnelSummary(rows || [], STAGES), [rows]);
  const visitors = useMemo(
    () => dailySeries(rows || [], { from, to: new Date(), value: (r) => r.metrics?.traffic?.visitors }),
    [rows, from],
  );
  const visitorDays = visitors.reduce((s, p) => s + (p.value || 0), 0);

  return (
    <Panel title="Site funnel">
      <p className="text-small text-ink-soft -mt-3 mb-5">
        Last {WINDOW} days, {funnel.days} {funnel.days === 1 ? 'day' : 'days'} with a snapshot
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
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="min-w-0">
            <BarList
              caption={`Events per step, summed over the last ${WINDOW} days`}
              rows={funnel.stages.map((s) => ({
                key: s.key,
                label: s.label,
                value: s.value,
                display: s.value.toLocaleString(),
                aside: s.ofPrev == null ? null : `${pct(s.ofPrev)}% of above`,
                tip: s.ofPrev == null ? 'events, the first step' : `events, ${pct(s.ofPrev)}% of the step above`,
              }))}
            />
            <p className="text-small text-ink-soft mt-3">
              Counts events, not people, so a step can pass 100% of the one above.
            </p>
          </div>
          <div className="min-w-0">
            <LineChart
              series={visitors}
              unit="visitors"
              label={`Visitors per day, last ${WINDOW} days`}
            />
            {visitorDays > 0 && (
              <p className="text-small text-ink-soft mt-3">
                {visitorDays.toLocaleString()} visits in total, a returning visitor counted once per day.
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
