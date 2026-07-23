import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CurrencyEur, TrendUp, Sparkle, X } from '@phosphor-icons/react';
import { db, fetchAll } from '@/lib/db';
import { confettiBurst } from '@/lib/confetti';
import { triggerCelebration } from '@/lib/celebration';
import Pill from '@/components/Pill';

// The money counter. YT-subscriber-counter energy: lifetime revenue GENERATED
// (not what was paid out), MRR, sales today - and confetti the moment a new
// sale row lands via realtime (scripts/stripe-pull.mjs feeds the sales table
// from the WSL cron every ~5 min). Numbers animate up; green is reserved for
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
    <div
      className={`relative overflow-hidden bg-card rounded-xl3 border shadow-card p-5 mb-4 animate-rise transition-colors duration-700 ${
        flash ? 'border-emerald-400 ring-2 ring-emerald-300/40' : 'border-line'
      }`}
    >
      <div className="relative flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <CurrencyEur size={17} weight="bold" />
          </span>
          <div>
            <h2 className="font-semibold text-[15px]">Revenue</h2>
            <p className="text-ink-soft text-[12px]">
              Generated, lifetime · updates every ~5 min
              {stats.last ? ` · last sale ${ago(stats.last.paid_at)}` : ''}
            </p>
          </div>
        </div>
        {flash && (
          <Pill tone="good">
            <Sparkle size={12} weight="fill" /> New sale
          </Pill>
        )}
      </div>

      {empty ? (
        <div className="text-[13px] text-ink-soft bg-cream/60 rounded-2xl px-4 py-3">
          Waiting for Stripe. Add <span className="font-mono text-[12px]">STRIPE_API_KEY</span> to
          the WSL <span className="font-mono text-[12px]">.env</span>, apply{' '}
          <span className="font-mono text-[12px]">db-setup.sql</span>, then{' '}
          <span className="font-mono text-[12px]">node scripts/stripe-pull.mjs</span> backfills
          every sale.
        </div>
      ) : (
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="col-span-2 text-left bg-card rounded-2xl border border-line px-4 py-3.5 hover:border-emerald-300 hover:shadow-cardhover transition-all active:scale-[0.99]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Total generated</p>
            <p className="font-mono text-[38px] sm:text-[42px] font-bold tabular-nums tracking-tight leading-none">
              {sym(stats.currency)}
              {shownTotal.toFixed(2)}
            </p>
            <p className="font-mono text-[11px] text-ink-soft tabular-nums mt-1.5">
              {stats.count} sale{stats.count === 1 ? '' : 's'} all time · tap to expand
            </p>
          </button>
          <div className="bg-card rounded-2xl border border-line px-3.5 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendUp size={14} weight="bold" className="text-emerald-600" />
              <p className="text-[12px] font-medium text-ink-soft">MRR</p>
            </div>
            <p className="font-mono text-[19px] font-semibold tabular-nums tracking-tight leading-none">
              {stats.mrr == null ? '-' : `${sym(stats.currency)}${shownMrr.toFixed(2)}`}
            </p>
          </div>
          <div className="bg-card rounded-2xl border border-line px-3.5 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkle size={14} weight="bold" className="text-coral-dark" />
              <p className="text-[12px] font-medium text-ink-soft">Today</p>
            </div>
            <p className="font-mono text-[19px] font-semibold tabular-nums tracking-tight leading-none">
              {stats.todayCount > 0 ? `${sym(stats.currency)}${stats.todayAmount.toFixed(2)}` : '-'}
            </p>
            {stats.todayCount > 0 && (
              <p className="font-mono text-[11px] text-ink-soft tabular-nums mt-1">
                {stats.todayCount} sale{stats.todayCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>
      )}

      {expanded && (
        <div
          className="fixed inset-0 z-[100] bg-card flex flex-col items-center justify-center px-6"
          role="dialog"
          aria-modal="true"
          aria-label="Total revenue, full screen"
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Close"
            className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 w-10 h-10 rounded-full border border-line flex items-center justify-center text-ink-soft hover:bg-cream"
          >
            <X size={18} weight="bold" />
          </button>
          <span className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5">
            <CurrencyEur size={24} weight="bold" />
          </span>
          <p className="text-[14px] font-medium text-ink-soft mb-2">Total revenue generated, lifetime</p>
          <p className="font-mono font-bold tabular-nums tracking-tight leading-none text-center text-[15vw] sm:text-[96px]">
            {sym(stats.currency)}
            {shownTotal.toFixed(2)}
          </p>
          <p className="font-mono text-[13px] text-ink-soft tabular-nums mt-4">
            {stats.count} sale{stats.count === 1 ? '' : 's'} all time
            {stats.mrr != null ? ` · ${sym(stats.currency)}${stats.mrr.toFixed(2)} MRR` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
