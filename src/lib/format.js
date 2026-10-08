// Shared number formatting so every tile, card, and detail row reads the same.

// Thousands-separated integer: 1240 -> "1,240".
export function formatNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  return v.toLocaleString();
}

// Compact for tight spots: 1240 -> "1.2k", 2_500_000 -> "2.5M".
export function compactNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(v);
}

// Money with a currency symbol prefix and 2 decimals.
export function formatMoney(n, symbol = '€') {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  return `${symbol}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SYMBOLS = { eur: '€', usd: '$', gbp: '£' };

// The prefix for an amount: € $ £ for the three common codes, else the code in
// upper case and a space ("SEK 120"). Empty for no code.
export function currencySymbol(code) {
  const c = typeof code === 'string' ? code.trim().toLowerCase() : '';
  if (!c) return '';
  return SYMBOLS[c] ?? `${c.toUpperCase()} `;
}

const en = (v, digits) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Money for a key number or a legend: cents under 100 (€18.00), whole units
// up to 10,000 (€353, €1,240), then short (€12.4k, €2.5M). A hyphen for
// anything that is not a number.
export function formatMoneyShort(n, currency = 'eur') {
  if (n === null || n === undefined || n === '') return '-';
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  const sym = currencySymbol(currency);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  // Each step is chosen on the rounded figure, so 99.999 reads €100 and not
  // €100.00, and 999,960 reads €1M and not €1000k.
  const short = (div) => (abs / div).toFixed(1).replace(/\.0$/, '');
  let body;
  if (Number(abs.toFixed(2)) < 100) body = en(abs, 2);
  else if (Math.round(abs) < 10_000) body = en(Math.round(abs), 0);
  else if (Number(short(1_000)) < 1_000) body = `${short(1_000)}k`;
  else body = `${short(1_000_000)}M`;
  return `${sign}${sym}${body}`;
}

// A percentage with a fixed number of decimals: 2.521 -> "2.52%".
export function formatPct(n, digits = 2) {
  if (n === null || n === undefined || n === '') return '-';
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  const d = Number.isInteger(digits) && digits >= 0 && digits <= 20 ? digits : 2;
  return `${v.toFixed(d)}%`;
}
