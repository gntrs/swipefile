import { supabase } from './supabase';

// Your own brand, exactly as you type it when adding your own ads. The app
// uses it everywhere to split "our ads" from competitor ads. Configure with
// VITE_OWN_BRAND in .env (defaults to "My Brand").
export const OWN_BRAND = import.meta.env.VITE_OWN_BRAND || 'My Brand';
export const isOwnBrand = (name) =>
  (name || '').trim().toLowerCase() === OWN_BRAND.trim().toLowerCase();

// Star lives in the ads.metrics jsonb (metrics.starred) rather than its own
// column, so it works with zero schema migration - and the daily importers
// already merge metrics ({...old, ...new}) on refresh, so a star survives a
// re-import. Team-wide (this is a shared internal tool).
export async function setStarred(ad, starred) {
  const metrics = { ...(ad.metrics || {}), starred };
  const { error } = await supabase.from('ads').update({ metrics }).eq('id', ad.id);
  if (error) console.warn('[star] update failed:', error.message);
  return !error;
}

export const isStarred = (a) => Boolean(a?.metrics?.starred);

// Proven = a human called it a winner, or the brand paid to run it 30+ days
// (the auto-verdict threshold). Same rule the hook bank and importers use.
export const isProven = (a) => a?.verdict === 'winner' || (a?.metrics?.days_running ?? 0) >= 30;

// Reach rating: one glanceable AMAZING / GOOD / BAD verdict on a card, so you
// can read "is this ad working" without parsing numbers. Blends reach (how many
// humans saw it) with CTR (how hard it pulled) - a big reach that nobody clicks
// is not amazing. Returns null when the ad has no performance data at all (most
// competitor / Ad-Library rows), so those cards just fall back to days-running.
export function reachRating(ad) {
  const m = ad?.metrics || {};
  const reach = +m.reach || 0;
  const ctr = +m.ctr || 0;
  if (!reach && !ctr) return null;
  if (ctr >= 5 || reach >= 3000) return { label: 'AMAZING', tone: 'bg-emerald-500 text-black' };
  if (ctr >= 2 || reach >= 800) return { label: 'GOOD', tone: 'bg-amber-400 text-black' };
  return { label: 'BAD', tone: 'bg-rose-500 text-white' };
}

// Short human reach, e.g. 4125 -> "4.1k". Empty string when unknown.
export function fmtReach(ad) {
  const r = +(ad?.metrics?.reach) || 0;
  if (!r) return '';
  return r >= 1000 ? `${(r / 1000).toFixed(1)}k` : String(r);
}

// Where "see the actual creative" points. Deliberately NOT Foreplay - if the
// team pasted a real ad link (Ad Library / post url) we use that, otherwise we
// send them to a Meta Ad Library keyword search on the brand. Never leaks the
// foreplay_url even though it exists in metrics.
export function creativeLink(ad) {
  const m = ad?.metrics || {};
  if (m.source_url) return m.source_url;
  const q = encodeURIComponent(ad?.brand || ad?.hook || '');
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${q}&search_type=keyword_unordered`;
}
