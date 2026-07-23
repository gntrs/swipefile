import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowSquareOut, Check, Copy, MagnifyingGlass, Quotes } from '@phosphor-icons/react';
import { fetchAll } from '@/lib/db';
import { isOwnBrand } from '@/lib/brand';

const WHO = [
  { id: 'all', label: 'All' },
  { id: 'ours', label: 'Ours' },
  { id: 'rivals', label: 'Rivals' },
];

const ONLY = [
  { id: 'all', label: 'Everything' },
  { id: 'proven', label: 'Proven' },
  { id: 'live', label: 'Live now' },
];

const isOurs = (a) => isOwnBrand(a.brand);
// A hook is proven when a human marked the ad a winner, or the brand kept
// paying to run it for 30+ days (the auto-verdict threshold).
const isProven = (a) => a.verdict === 'winner' || (a.metrics?.days_running ?? 0) >= 30;

// The hook to show for an ad. Prefer the headline; when it is blank (Ad
// Library and Foreplay-Spyder rows often carry no headline, only body copy),
// fall back to the first line of the copy so those ads - hundreds of them,
// many proven - still land in the bank. Capped so a hook stays a hook and
// not a whole paragraph.
function hookText(a) {
  const headline = (a.hook || '').trim();
  if (headline) return headline;
  const firstLine = (a.ad_copy || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  return firstLine.length > 140 ? `${firstLine.slice(0, 137).trimEnd()}...` : firstLine;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      aria-label="Copy hook"
      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
        copied ? 'bg-mint/40 text-emerald-700' : 'text-ink-soft hover:bg-cream'
      }`}
    >
      {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
    </button>
  );
}

// Every hook we know, ours and the competition's, ready to steal from when
// writing new ads. Duplicates collapse into one card; proven hooks float up.
export default function HookBank() {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [only, setOnly] = useState('all');
  const [tag, setTag] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetchAll((q) => q.order('created_at', { ascending: false }), 'ads').then((data) => {
      if (!mounted) return;
      setAds(data.filter((a) => hookText(a)));
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Collapse identical hook text into one card carrying its best ad.
  const hooks = useMemo(() => {
    const map = new Map();
    for (const a of ads) {
      const text = hookText(a);
      const key = text.toLowerCase();
      if (!map.has(key)) map.set(key, { text, ads: [] });
      map.get(key).ads.push(a);
    }
    return [...map.values()].map((h) => {
      const best =
        h.ads.find((a) => a.verdict === 'winner') ||
        [...h.ads].sort(
          (a, b) => (b.metrics?.days_running ?? -1) - (a.metrics?.days_running ?? -1)
        )[0];
      return {
        ...h,
        best,
        brands: [...new Set(h.ads.map((a) => (a.brand || '').trim()).filter(Boolean))],
        tags: [...new Set(h.ads.flatMap((a) => a.tags || []))],
        drivers: [...new Set(h.ads.flatMap((a) => a.metrics?.emotional_drivers || []))],
        proven: h.ads.some(isProven),
        live: h.ads.some((a) => a.metrics?.live),
        days: Math.max(...h.ads.map((a) => a.metrics?.days_running ?? 0)),
        ours: h.ads.some(isOurs),
        rivals: h.ads.some((a) => !isOurs(a)),
      };
    });
  }, [ads]);

  const topTags = useMemo(() => {
    const counts = new Map();
    for (const h of hooks) for (const t of h.tags) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
  }, [hooks]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return hooks
      .filter((h) => {
        if (who === 'ours' && !h.ours) return false;
        if (who === 'rivals' && !h.rivals) return false;
        if (only === 'proven' && !h.proven) return false;
        if (only === 'live' && !h.live) return false;
        if (tag && !h.tags.includes(tag)) return false;
        if (!term) return true;
        return [h.text, ...h.brands, ...h.tags, ...h.drivers]
          .join(' ')
          .toLowerCase()
          .includes(term);
      })
      .sort(
        (a, b) =>
          Number(b.proven) - Number(a.proven) ||
          b.days - a.days ||
          new Date(b.best.created_at) - new Date(a.best.created_at)
      );
  }, [hooks, q, who, only, tag]);

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[860px] mx-auto">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Hook bank</h1>
        <p className="text-ink-soft text-[14px]">
          {hooks.length} hooks to steal from. Proven ones float to the top.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 mb-3">
        <div className="flex items-center gap-2 bg-card border border-line rounded-2xl px-3">
          <MagnifyingGlass size={18} className="text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search hooks, brands, tags..."
            className="w-full py-2.5 bg-transparent focus:outline-none text-[14px]"
          />
        </div>
        <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap">
          {WHO.map((w) => (
            <button
              key={w.id}
              onClick={() => setWho(w.id)}
              className={`flex-shrink-0 px-3 py-2 rounded-2xl text-[13px] font-semibold transition-colors ${
                who === w.id ? 'bg-ink text-black' : 'bg-card border border-line text-ink-soft'
              }`}
            >
              {w.label}
            </button>
          ))}
          {ONLY.map((o) => (
            <button
              key={o.id}
              onClick={() => setOnly(o.id)}
              className={`flex-shrink-0 px-3 py-2 rounded-2xl text-[13px] font-semibold transition-colors ${
                only === o.id ? 'bg-coral text-black' : 'bg-card border border-line text-ink-soft'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {topTags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {topTags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                className={`px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors ${
                  tag === t ? 'bg-coral text-black' : 'bg-card border border-line text-ink-soft'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-ink-soft">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-ink-soft">
          <Quotes size={32} className="mx-auto mb-2" />
          <p>No hooks match. Hooks come from the ads in the library.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((h) => (
            <div
              key={h.text.toLowerCase()}
              className="bg-card rounded-xl3 border border-line shadow-card px-4 py-3.5 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[15px] leading-snug break-words">{h.text}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {h.proven && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-mint/30 text-emerald-700">
                      proven
                    </span>
                  )}
                  {h.live && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cream text-emerald-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      live{h.days > 0 && ` · ${h.days}d`}
                    </span>
                  )}
                  {h.brands.slice(0, 2).map((b) => (
                    <span
                      key={b}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        isOwnBrand(b)
                          ? 'bg-coral-soft text-coral-dark'
                          : 'bg-cream text-ink-soft'
                      }`}
                    >
                      {b}
                    </span>
                  ))}
                  {h.ads.length > 1 && (
                    <span className="text-[11px] text-ink-soft">seen in {h.ads.length} ads</span>
                  )}
                  {h.drivers.slice(0, 3).map((d) => (
                    <span
                      key={d}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-shrink-0 -mr-1">
                <CopyButton text={h.text} />
                <Link
                  to={`/ad/${h.best.id}`}
                  aria-label="Open the ad"
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-ink-soft hover:bg-cream"
                >
                  <ArrowSquareOut size={16} weight="bold" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
