import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Binoculars,
  CaretDown,
  Images,
  Lightning,
  Megaphone,
  PlusCircle,
  TrendUp,
} from '@phosphor-icons/react';
import { fetchAll } from '@/lib/supabase';
import { isOwnBrand } from '@/lib/ads';
import { useTeam } from '@/contexts/TeamContext';
import AdCard from '@/components/AdCard';
import StatCard from '@/components/StatCard';
import TrackCompetitors from '@/components/TrackCompetitors';

const DAY = 86400000;

function ago(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

const isCompetitor = (brand) => Boolean(brand && brand.trim()) && !isOwnBrand(brand);

// Everything we know about the other brands, in one place: their ads (mostly
// via the Meta Ad Library import, plus anything added by hand), how active
// they have been lately, and the social posts the team has logged for them
// or the weekly Brave scrape has spotted.
export default function Competitors() {
  const { displayName } = useTeam();
  const [ads, setAds] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchAll((q) => q.order('created_at', { ascending: false }), 'ads'),
      fetchAll((q) => q.order('posted_at', { ascending: false, nullsFirst: false }), 'posts'),
    ]).then(([adsData, postsData]) => {
      if (!mounted) return;
      setAds(adsData);
      setPosts(postsData);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const compAds = useMemo(() => ads.filter((a) => isCompetitor(a.brand)), [ads]);
  const compPosts = useMemo(() => posts.filter((p) => isCompetitor(p.brand)), [posts]);

  const brands = useMemo(() => {
    const map = new Map();
    for (const a of compAds) {
      const key = a.brand.trim().toLowerCase();
      if (!map.has(key)) map.set(key, { key, name: a.brand.trim(), ads: [] });
      map.get(key).ads.push(a);
    }
    for (const p of compPosts) {
      const key = p.brand.trim().toLowerCase();
      if (!map.has(key)) map.set(key, { key, name: p.brand.trim(), ads: [] });
    }
    const cutoff = Date.now() - 30 * DAY;
    return [...map.values()]
      .map((b) => ({
        ...b,
        running: b.ads.filter((a) => a.status === 'running').length,
        winners: b.ads.filter((a) => a.verdict === 'winner').length,
        new30: b.ads.filter((a) => new Date(a.created_at) >= cutoff).length,
        lastSeen: b.ads[0]?.created_at || null,
        platforms: [...new Set(b.ads.map((a) => a.platform).filter(Boolean))],
        posts: compPosts.filter((p) => p.brand.trim().toLowerCase() === b.key),
      }))
      .sort((a, b) => b.running - a.running || b.new30 - a.new30 || b.ads.length - a.ads.length);
  }, [compAds, compPosts]);

  const totals = useMemo(() => {
    const cutoff = Date.now() - 30 * DAY;
    return {
      brands: brands.length,
      ads: compAds.length,
      running: compAds.filter((a) => a.status === 'running').length,
      new30: compAds.filter((a) => new Date(a.created_at) >= cutoff).length,
    };
  }, [brands, compAds]);

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Competitors</h1>
          <p className="text-ink-soft text-[14px]">What the other brands are running</p>
        </div>
        <Link
          to="/ads/add"
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-coral text-black font-semibold shadow-cta active:scale-[0.98] transition-transform"
        >
          <PlusCircle size={20} weight="bold" /> Add ad
        </Link>
      </div>

      <TrackCompetitors />

      {loading ? (
        <p className="text-ink-soft">Loading...</p>
      ) : brands.length === 0 ? (
        <div className="text-center py-20 text-ink-soft">
          <Binoculars size={32} className="mx-auto mb-2" />
          <p className="mb-2">No competitor ads yet.</p>
          <p className="text-[13px]">
            Track a brand above to pull its ads from the Meta Ad Library, or{' '}
            <Link to="/ads/add" className="text-coral-dark font-semibold">
              add one by hand
            </Link>{' '}
            with the brand filled in.
          </p>
        </div>
      ) : (
        <>
          {/* Activity overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon={Binoculars} label="Brands tracked" value={totals.brands} accent="coral" />
            <StatCard icon={Images} label="Ads tracked" value={totals.ads} accent="violet" />
            <StatCard icon={Lightning} label="Running now" value={totals.running} accent="amber" />
            <StatCard icon={TrendUp} label="New in 30 days" value={totals.new30} accent="blue" />
          </div>

          {/* Top competitors */}
          <div className="flex flex-col gap-2.5">
            {brands.map((b) => (
              <div
                key={b.key}
                className="bg-card rounded-xl3 border border-line shadow-card overflow-hidden"
              >
                <button
                  onClick={() => setOpen(open === b.key ? null : b.key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-[15px]">{b.name}</p>
                      {b.running > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                          {b.running} running
                        </span>
                      )}
                      {b.new30 > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-coral-soft text-coral-dark">
                          {b.new30} new in 30d
                        </span>
                      )}
                      {b.winners > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                          {b.winners} winner{b.winners > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-ink-soft truncate mt-0.5">
                      {[
                        `${b.ads.length} ${b.ads.length === 1 ? 'ad' : 'ads'}`,
                        b.posts.length > 0 &&
                          `${b.posts.length} ${b.posts.length === 1 ? 'post' : 'posts'}`,
                        b.platforms.join(', '),
                        b.lastSeen && `last seen ${ago(b.lastSeen)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <CaretDown
                    size={16}
                    weight="bold"
                    className={`text-ink-soft flex-shrink-0 transition-transform ${
                      open === b.key ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {open === b.key && (
                  <div className="px-4 pb-4 border-t border-line pt-4">
                    {b.ads.length === 0 ? (
                      <p className="text-ink-soft text-[13px]">No ads yet, only posts.</p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {b.ads.slice(0, 8).map((ad) => (
                          <AdCard key={ad.id} ad={ad} />
                        ))}
                      </div>
                    )}
                    {b.ads.length > 8 && (
                      <Link
                        to={`/ads?q=${encodeURIComponent(b.name)}`}
                        className="inline-block mt-3 text-coral-dark text-[13px] font-semibold"
                      >
                        See all {b.ads.length} in the library
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Competitor social posts */}
          <div className="flex items-center justify-between gap-3 mt-8 mb-3">
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight">Their social posts</h2>
              <p className="text-ink-soft text-[13px]">
                Organic content spotted on competitor accounts
              </p>
            </div>
            <Link
              to="/posts/add?competitor=1"
              className="flex items-center gap-1.5 text-coral-dark text-[14px] font-semibold flex-shrink-0"
            >
              <PlusCircle size={18} weight="bold" /> Log one
            </Link>
          </div>

          {compPosts.length === 0 ? (
            <div className="bg-card rounded-xl3 border border-line shadow-card px-4 py-6 text-center text-ink-soft">
              <Megaphone size={24} className="mx-auto mb-1.5" />
              <p className="text-[13px]">
                Nothing logged yet. Spot a competitor post worth remembering?{' '}
                <Link to="/posts/add?competitor=1" className="text-coral-dark font-semibold">
                  Log it
                </Link>{' '}
                with the brand filled in.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {compPosts.map((p) => (
                <Link
                  key={p.id}
                  to={`/post/${p.id}`}
                  className="bg-card rounded-xl3 border border-line shadow-card hover:shadow-cardhover transition-all px-4 py-3 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-coral-soft text-coral-dark flex-shrink-0">
                        {p.brand.trim()}
                      </span>
                      <p className="font-semibold text-[15px] truncate">
                        {p.title || 'Untitled post'}
                      </p>
                    </div>
                    <p className="text-[12px] text-ink-soft truncate mt-0.5">
                      {[
                        p.platform,
                        p.post_type,
                        p.posted_at,
                        p.added_by_email && `by ${displayName(p.added_by_email)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
