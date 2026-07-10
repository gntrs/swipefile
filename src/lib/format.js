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
