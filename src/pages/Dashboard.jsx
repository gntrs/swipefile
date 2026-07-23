import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Images, Megaphone, Trophy, ChatCircleText } from '@phosphor-icons/react';
import { db, fetchAll } from '@/lib/db';
import StatCard from '@/components/StatCard';
import { Skeleton, StatSkeleton } from '@/components/Skeleton';
import TeamChat from '@/components/TeamChat';
import Goals from '@/components/Goals';
import LatestBrief from '@/components/LatestBrief';
import AdAnalytics from '@/components/AdAnalytics';
import ProvenPlays from '@/components/ProvenPlays';
import FunnelCard from '@/components/FunnelCard';
import RevenueCard from '@/components/RevenueCard';
import IntelCard from '@/components/IntelCard';
import Fold from '@/components/Fold';
import { useTeam } from '@/contexts/TeamContext';

// Verdict = status colors, ALWAYS shown with a label (never color alone).
const VERDICTS = [
  { key: 'winner', label: 'Winners', bar: 'bg-emerald-400' },
  { key: 'testing', label: 'Testing', bar: 'bg-amber-300' },
  { key: 'unsure', label: 'Unsure', bar: 'bg-line' },
  { key: 'loser', label: 'Losers', bar: 'bg-red-300' },
];

// A rising cumulative curve of how a collection grew over its own lifetime,
// sampled into a handful of points for a stat-tile sparkline.
function sparkOf(items, buckets = 12) {
  const ts = items
    .map((i) => new Date(i.created_at).getTime())
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (ts.length < 2) return null;
  const start = ts[0];
  const span = Date.now() - start || 1;
  const out = [];
  for (let k = 1; k <= buckets; k++) {
    const t = start + (span * k) / buckets;
    out.push(ts.filter((x) => x <= t).length);
  }
  return out;
}

// How many landed in the last `days` - drives the "+N" delta pill.
function newWithin(items, days = 7) {
  const cut = Date.now() - days * 86400000;
  return items.filter((i) => new Date(i.created_at).getTime() >= cut).length;
}

function greetingFor() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const [ads, setAds] = useState([]);
  const [posts, setPosts] = useState([]);
  const [notes, setNotes] = useState(0);
  const [loading, setLoading] = useState(true);
  const { displayName, me } = useTeam();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [a, p, c] = await Promise.all([
        fetchAll((q) => q.order('created_at', { ascending: false }), 'ads'),
        fetchAll((q) => q.order('created_at', { ascending: false }), 'posts'),
        db.from('comments').select('id', { count: 'exact', head: true }),
      ]);
      if (!mounted) return;
      setAds(a);
      setPosts(p);
      setNotes(c.count || 0);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const winnerAds = ads.filter((a) => a.verdict === 'winner');
  const winners = winnerAds.length;

  // Verdict counts across ads for the labeled breakdown bar.
  const verdictCounts = useMemo(() => {
    const m = Object.fromEntries(VERDICTS.map((v) => [v.key, 0]));
    ads.forEach((a) => {
      m[a.verdict] = (m[a.verdict] || 0) + 1;
    });
    return m;
  }, [ads]);
  const totalAds = ads.length || 1;

  // Recent activity: newest 6 items across ads + posts.
  const recent = useMemo(() => {
    const items = [
      ...ads.map((a) => ({ kind: 'ad', id: a.id, label: a.brand || 'Untitled ad', by: a.added_by_email, at: a.created_at, to: `/ad/${a.id}` })),
      ...posts.map((p) => ({ kind: 'post', id: p.id, label: p.title || p.platform || 'Post', by: p.added_by_email, at: p.created_at, to: `/post/${p.id}` })),
    ];
    return items.sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 6);
  }, [ads, posts]);

  // Top tags across everything.
  const topTags = useMemo(() => {
    const m = new Map();
    [...ads, ...posts].forEach((x) => (x.tags || []).forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [ads, posts]);

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const myName = me?.nickname || '';

  if (loading)
    return (
      <div className="px-5 sm:px-8 py-6 max-w-[1100px] mx-auto">
        <Skeleton className="w-40 h-3.5 mb-2" />
        <Skeleton className="w-52 h-8 mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      </div>
    );

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[1100px] mx-auto">
      {/* Reference-style header: quiet dated eyebrow, then a big greeting. */}
      <header className="mb-6 animate-rise">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{dateLabel}</p>
        <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight mt-1">
          {greetingFor()}{myName ? `, ${myName}` : ''}
        </h1>
        <p className="text-ink-soft text-[14px] mt-1">Ads, posts and what the team thinks of them.</p>
      </header>

      {/* The money counter: lifetime revenue + MRR + live confetti per sale */}
      <Fold id="revenue" title="Revenue">
        <RevenueCard />
      </Fold>

      {/* KPI tiles */}
      <Fold id="kpis" title="Key numbers">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatCard icon={Images} label="Ads saved" value={ads.length} accent="coral" to="/ads"
            trend={sparkOf(ads)} delta={newWithin(ads) ? `+${newWithin(ads)}` : null} />
          <StatCard icon={Trophy} label="Winning ads" value={winners} accent="emerald" to="/ads?proven=1"
            trend={sparkOf(winnerAds)} delta={newWithin(winnerAds) ? `+${newWithin(winnerAds)}` : null} />
          <StatCard icon={Megaphone} label="Organic posts" value={posts.length} accent="violet" to="/posts"
            trend={sparkOf(posts)} delta={newWithin(posts) ? `+${newWithin(posts)}` : null} />
          <StatCard icon={ChatCircleText} label="Team notes" value={notes} accent="blue" />
        </div>
      </Fold>

      {/* Performance layer: our ad numbers + competitor pressure, the rivals'
          battle-tested plays to beat, then our own funnel */}
      <Fold id="performance" title="Ad performance">
        <AdAnalytics ads={ads} />
      </Fold>
      <Fold id="proven" title="Rivals' proven plays">
        <ProvenPlays ads={ads} />
      </Fold>
      <Fold id="funnel" title="Site funnel">
        <FunnelCard />
      </Fold>

      {/* SEO rank + EU ad geography headlines, links through to /intel */}
      <IntelCard ads={ads} />

      {/* Newest analysis brief from Claude (renders only when one exists) */}
      <LatestBrief />

      {/* Team board: quick chat + goals */}
      <Fold id="team" title="Team board">
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <TeamChat />
          <Goals />
        </div>
      </Fold>

      <Fold id="breakdown" title="Verdicts and tags">
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Verdict breakdown - labeled segmented bar (status colors + labels) */}
        <div className="bg-card rounded-xl3 border border-line shadow-card p-5">
          <h2 className="font-semibold text-[15px] mb-3">Ad verdicts</h2>
          {ads.length === 0 ? (
            <p className="text-ink-soft text-[13px]">No ads yet. <Link to="/ads/add" className="text-coral-dark font-medium">Add the first one</Link>.</p>
          ) : (
            <>
              <div className="flex h-3 rounded-full overflow-hidden gap-[2px] bg-cream mb-3">
                {VERDICTS.filter((v) => verdictCounts[v.key] > 0).map((v) => (
                  <div
                    key={v.key}
                    className={`${v.bar} h-full`}
                    style={{ width: `${(verdictCounts[v.key] / totalAds) * 100}%` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {VERDICTS.map((v) => (
                  <span key={v.key} className="flex items-center gap-1.5 text-[13px] text-ink-soft">
                    <span className={`w-2.5 h-2.5 rounded-full ${v.bar}`} />
                    {v.label} <span className="font-semibold text-ink tabular-nums">{verdictCounts[v.key]}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Top tags */}
        <div className="bg-card rounded-xl3 border border-line shadow-card p-5">
          <h2 className="font-semibold text-[15px] mb-3">Top tags</h2>
          {topTags.length === 0 ? (
            <p className="text-ink-soft text-[13px]">Tags will show up here as the library grows.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topTags.map(([tag, n]) => (
                <span key={tag} className="text-[13px] px-3 py-1.5 rounded-full bg-cream text-ink-soft">
                  {tag} <span className="font-semibold text-ink tabular-nums">{n}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      </Fold>

      {/* Recent activity */}
      <Fold id="recent" title="Recent activity" defaultOpen={false}>
      <div className="bg-card rounded-xl3 border border-line shadow-card p-5 mt-4">
        <h2 className="font-semibold text-[15px] mb-3">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="text-ink-soft text-[13px]">Nothing yet. Add an ad or a post to get rolling.</p>
        ) : (
          <div className="divide-y divide-line">
            {recent.map((r) => (
              <Link key={`${r.kind}-${r.id}`} to={r.to} className="flex items-center gap-3 py-2.5 group">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${r.kind === 'ad' ? 'bg-coral-soft text-coral-dark' : 'bg-amber-100 text-amber-700'}`}>
                  {r.kind}
                </span>
                <span className="flex-1 min-w-0 truncate text-[14px] font-medium group-hover:text-coral-dark transition-colors">{r.label}</span>
                <span className="text-[12px] text-ink-soft flex-shrink-0">
                  {r.by ? `by ${displayName(r.by)} · ` : ''}{new Date(r.at).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
      </Fold>
    </div>
  );
}
