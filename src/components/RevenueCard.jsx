import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkle, X } from '@phosphor-icons/react';
import { db, fetchAll } from '@/lib/db';
import { confettiBurst } from '@/lib/confetti';
import { triggerCelebration } from '@/lib/celebration';
import { Panel, Badge, Meta, Notice, IconButton } from '@/components/ui';

// The money counter. YT-subscriber-counter energy: lifetime revenue GENERATED
// (not what was paid out), MRR, sales today, and confetti the moment a new
// sale row lands via realtime (scripts/stripe-pull.mjs feeds the sales table
// from your cron machine every ~5 min). Numbers animate up; green is reserved for
// the good-news accents per the color law.

const CUR = { eur: '€', usd: '$', gbp: '£' };
const sym = (c) => CUR[(c || 'eur').toLowerCase()] || '';

// Animate a number toward its target - the odometer feel.
function useCountUp(target, ms = 900) {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return undefined;
    const started = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - started) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

const isToday = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
};

const ago = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

export default function RevenueCard() {
  const [summary, setSummary] = useState(null); // kpi_snapshots revenue key
  const [sales, setSales] = useState(null); // null = loading
  const [flash, setFlash] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Esc closes the full-screen total, same as the X.
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => e.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Latest snapshot that carries a revenue key (today's, normally).
      const { data: snaps } = await db
        .from('kpi_snapshots')
        .select('day, metrics')
        .order('day', { ascending: false })
        .limit(7);
      const withRev = (snaps || []).find((s) => s.metrics?.revenue);
      if (mounted) setSummary(withRev?.metrics?.revenue || null);

      const rows = await fetchAll(
        (q) => q.order('paid_at', { ascending: false }),
        'sales'
      ).catch(() => []);
      if (mounted) setSales(rows);
    })();

    // THE moment: a new sale arrives while the dashboard is open.
    const channel = db
      .channel('sales-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, (payload) => {
        if (!mounted) return;
        setSales((cur) => [payload.new, ...(cur || [])]);
        setFlash(true);
        confettiBurst();
        triggerCelebration(); // party-mode clip, no-op if none configured or disabled
        setTimeout(() => mounted && setFlash(false), 2500);
      })
      .subscribe();

    return () => {
      mounted = false;
      db.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    const list = sales || [];
    const currency = summary?.currency || list[0]?.currency || 'eur';
    // Lifetime gross: Stripe-computed total when available (authoritative),
    // else summed from sales rows.
    const fromRows = list.reduce((s, r) => s + Number(r.amount || 0), 0);
    const total = summary?.total_gross ?? Math.round(fromRows * 100) / 100;
    const today = list.filter((r) => isToday(r.paid_at));
    return {
      currency,
      total,
      mrr: summary?.mrr ?? null,
      todayCount: today.length,
      todayAmount: Math.round(today.reduce((s, r) => s + Number(r.amount || 0), 0) * 100) / 100,
      last: list[0] || null,
      count: summary?.sales_count ?? list.length,
    };
  }, [sales, summary]);

  const shownTotal = useCountUp(stats.total);
  const shownMrr = useCountUp(stats.mrr ?? 0);

  const empty = sales !== null && sales.length === 0 && !summary;

  return (
    <Panel
      title="Revenue"
      className={`transition-shadow duration-700 ${flash ? 'ring-2 ring-emerald-400/60' : ''}`}
      action={
        flash && (
          <Badge tone="good">
            <Sparkle size={12} weight="fill" aria-hidden="true" /> New sale
          </Badge>
        )
      }
    >
      <p className="text-small text-ink-soft -mt-3 mb-5">
        <Meta items={['Generated, lifetime', 'updates every ~5 min', stats.last && `last sale ${ago(stats.last.paid_at)}`]} />
      </p>

      {empty ? (
        <Notice tone="info">
          Waiting for Stripe. Add <code className="font-mono text-small">STRIPE_API_KEY</code> to{' '}
          <code className="font-mono text-small">.env</code> on your cron machine, apply{' '}
          <code className="font-mono text-small">db-setup.sql</code>, then run{' '}
          <code className="font-mono text-small">node scripts/stripe-pull.mjs</code> to backfill every sale.
        </Notice>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="press col-span-2 -m-3 p-3 text-left rounded-xl hover:bg-white/[0.03] transition-colors"
          >
            <p className="text-small font-medium text-ink-soft">Total generated</p>
            <p className="num text-num-lg text-ink mt-2">
              {sym(stats.currency)}
              {shownTotal.toFixed(2)}
            </p>
            <p className="text-small text-ink-soft mt-2">
              {stats.count} sale{stats.count === 1 ? '' : 's'} all time · tap to expand
            </p>
          </button>
          <div>
            <p className="text-small font-medium text-ink-soft">MRR</p>
            <p className="num text-lead text-ink mt-2">
              {stats.mrr == null ? '-' : `${sym(stats.currency)}${shownMrr.toFixed(2)}`}
            </p>
          </div>
          <div>
            <p className="text-small font-medium text-ink-soft">Today</p>
            <p className={`num text-lead mt-2 ${stats.todayCount > 0 ? 'text-emerald-300' : 'text-ink-soft'}`}>
              {stats.todayCount > 0 ? `${sym(stats.currency)}${stats.todayAmount.toFixed(2)}` : '-'}
            </p>
            {stats.todayCount > 0 && (
              <p className="text-small text-ink-soft mt-1">
                {stats.todayCount} sale{stats.todayCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>
      )}

      {expanded && (
        <div
          className="fixed inset-0 z-[100] bg-canvas flex flex-col items-center justify-center px-[var(--gutter)]"
          role="dialog"
          aria-modal="true"
          aria-label="Total revenue, full screen"
        >
          <IconButton
            label="Close"
            icon={X}
            variant="secondary"
            onClick={() => setExpanded(false)}
            className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4"
          />
          <p className="text-body text-ink-soft mb-3">Total revenue generated, lifetime</p>
          {/* The one screen sized number in the app: it scales with the window. */}
          <p className="num text-ink leading-none text-center" style={{ fontSize: 'clamp(3rem, 14vw, 7rem)' }}>
            {sym(stats.currency)}
            {shownTotal.toFixed(2)}
          </p>
          <p className="text-body text-ink-soft mt-5">
            {stats.count} sale{stats.count === 1 ? '' : 's'} all time
            {stats.mrr != null ? ` · ${sym(stats.currency)}${stats.mrr.toFixed(2)} MRR` : ''}
          </p>
        </div>
      )}
    </Panel>
  );
}
