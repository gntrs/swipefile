// The Revenue card's numbers, pure so they can be tested. Stripe can hold
// sales in more than one currency; amounts in different currencies are never
// added together. Everything is shown in one currency (the snapshot's, else
// the most common one in the sales rows) and the rest are counted apart.

const round2 = (v) => Math.round(v * 100) / 100;

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function revenueStats(sales, summary, now = new Date()) {
  const list = (Array.isArray(sales) ? sales : []).filter(Boolean);
  const cur = (r) => String(r.currency || 'eur').toLowerCase();
  let currency = summary?.currency ? String(summary.currency).toLowerCase() : null;
  if (!currency) {
    const counts = new Map();
    for (const r of list) counts.set(cur(r), (counts.get(cur(r)) || 0) + Number(r.amount || 0));
    currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'eur';
  }
  const inCur = list.filter((r) => cur(r) === currency);
  const other = list.length - inCur.length;
  const amount = (r) => {
    const v = Number(r.amount);
    return Number.isFinite(v) ? v : 0;
  };
  const fromRows = round2(inCur.reduce((s, r) => s + amount(r), 0));
  const today = inCur.filter((r) => {
    const d = new Date(r.paid_at);
    return !Number.isNaN(d.getTime()) && sameDay(d, now);
  });
  const total = summary && Number.isFinite(Number(summary.total_gross)) ? Number(summary.total_gross) : fromRows;
  const mrr = summary && Number.isFinite(Number(summary.mrr)) ? Number(summary.mrr) : null;
  const count = summary && Number.isFinite(Number(summary.sales_count)) ? Number(summary.sales_count) : inCur.length;
  return {
    currency,
    total,
    mrr,
    count,
    otherCurrencySales: other,
    todayCount: today.length,
    todayAmount: round2(today.reduce((s, r) => s + amount(r), 0)),
    last: list[0] || null,
  };
}
