// The Revenue card's numbers, pure so they can be tested. Stripe can hold
// sales in more than one currency; amounts in different currencies are never
// added together. Everything is shown in one currency (the snapshot's, else
// the most common one in the sales rows) and the rest are counted apart.

import { toMs, rollingWindows, inWindow, dayWindows, deltaOf } from './periods.js';

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

// The currency for a list of sales: the one asked for, else the one with the
// most revenue in the rows, else eur.
function salesCurrency(list, currency) {
  if (typeof currency === 'string' && currency.trim()) return currency.trim().toLowerCase();
  const counts = new Map();
  for (const r of list) {
    const c = String(r.currency || 'eur').toLowerCase();
    const v = Number(r.amount);
    counts.set(c, (counts.get(c) || 0) + (Number.isFinite(v) ? v : 0));
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || 'eur';
}

const saleMs = (r) => toMs(r?.paid_at);
const saleAmount = (r) => {
  const v = Number(r?.amount);
  return Number.isFinite(v) ? v : 0;
};

// Revenue in the last `days` days against the `days` before, in one currency.
// A sale belongs to a window when from < paid_at <= to. The change is only
// given when the sales history reaches back past the start of the current
// window: before the first sale ever, an empty previous window is no data,
// not a zero. Sales in other currencies inside either window are counted
// apart, never added.
export function revenueWindow(sales, { now = Date.now(), days = 30, currency } = {}) {
  const list = (Array.isArray(sales) ? sales : []).filter((r) => r && typeof r === 'object');
  const cur = salesCurrency(list, currency);
  const w = rollingWindows(days, now);
  if (!w) return { currency: cur, cur: null, prev: null, delta: null, count: 0, prevCount: 0, otherCurrencySales: 0, comparable: false };
  const inCur = list.filter((r) => String(r.currency || 'eur').toLowerCase() === cur && saleMs(r) !== null);
  const curRows = inCur.filter((r) => inWindow(saleMs(r), w.cur));
  const prevRows = inCur.filter((r) => inWindow(saleMs(r), w.prev));
  const other = list.filter(
    (r) => String(r.currency || 'eur').toLowerCase() !== cur && (inWindow(saleMs(r), w.cur) || inWindow(saleMs(r), w.prev))
  ).length;
  const first = inCur.reduce((m, r) => Math.min(m, saleMs(r)), Infinity);
  const comparable = first <= w.cur.from;
  const curSum = round2(curRows.reduce((s, r) => s + saleAmount(r), 0));
  const prevSum = round2(prevRows.reduce((s, r) => s + saleAmount(r), 0));
  return {
    currency: cur,
    cur: curSum,
    prev: prevSum,
    delta: comparable ? deltaOf(curSum, prevSum, { polarity: 'up' }) : null,
    count: curRows.length,
    prevCount: prevRows.length,
    otherCurrencySales: other,
    comparable,
  };
}

// Revenue per UTC day over the last `days` days, today last, in one currency.
// A day after the first sale ever with no sale is 0; a day before it is null,
// so a line starts where the data starts.
export function revenueDaily(sales, { now = Date.now(), days = 30, currency } = {}) {
  const list = (Array.isArray(sales) ? sales : []).filter((r) => r && typeof r === 'object');
  const w = dayWindows(days, now);
  if (!w) return [];
  const cur = salesCurrency(list, currency);
  const byDay = new Map();
  let first = null;
  for (const r of list) {
    if (String(r.currency || 'eur').toLowerCase() !== cur) continue;
    const t = saleMs(r);
    if (t === null) continue;
    const day = new Date(t).toISOString().slice(0, 10);
    if (first === null || day < first) first = day;
    byDay.set(day, (byDay.get(day) || 0) + saleAmount(r));
  }
  const out = [];
  const start = Date.parse(`${w.cur.from}T00:00:00Z`);
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const value = first === null || day < first ? null : round2(byDay.get(day) || 0);
    out.push({ day, value });
  }
  return out;
}
