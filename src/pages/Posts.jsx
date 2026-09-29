import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, MagnifyingGlass, Megaphone } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useTeam } from '@/contexts/TeamContext';
import { RowsSkeleton } from '@/components/Skeleton';

const PLATFORMS = ['all', 'Facebook', 'Instagram', 'TikTok', 'YouTube', 'Other'];

const VERDICT = {
  winner: 'bg-emerald-500/15 text-emerald-300',
  loser: 'bg-red-100 text-red-600',
  testing: 'bg-amber-100 text-amber-700',
  unsure: 'bg-line text-ink-soft',
};

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('all');
  const { displayName } = useTeam();

  useEffect(() => {
    let mounted = true;
    db
      .from('posts')
      .select('*')
      .order('posted_at', { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        if (!mounted) return;
        setPosts(data || []);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return posts.filter((p) => {
      if (platform !== 'all' && p.platform !== platform) return false;
      if (!term) return true;
      return [p.title, p.copy, p.platform, p.brand, ...(p.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [posts, q, platform]);

  const metric = (p, key) => p?.metrics?.[key] ?? null;

  return (
    <div data-page="posts" className="px-5 sm:px-8 pt-6 sm:pt-8 pb-10 max-w-[1100px] mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-[1.1]">Organic posts</h1>
          <p className="font-mono text-ink-soft text-[12px] mt-2">{posts.length} logged</p>
        </div>
        <Link
          to="/posts/add"
          className="press flex-shrink-0 flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-accent text-black text-[14px] font-semibold whitespace-nowrap hover:bg-accent-dim transition-colors"
        >
          <PlusCircle size={20} weight="bold" /> Add post
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-5">
        <div className="flex-1 flex items-center gap-2 bg-card border border-line rounded-2xl px-3">
          <MagnifyingGlass size={18} className="text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, copy, tags..."
            className="w-full min-h-[44px] py-2.5 bg-transparent focus:outline-none text-[14px]"
          />
        </div>
        <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`flex-shrink-0 min-h-[44px] min-w-[44px] px-3 py-2 rounded-2xl text-[13px] font-semibold transition-colors ${
                platform === p ? 'bg-accent text-black' : 'bg-white/[0.06] text-ink-soft hover:text-ink'
              }`}
            >
              {p === 'all' ? 'All' : p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <RowsSkeleton rows={3} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-ink-soft">
          <Megaphone size={32} className="mx-auto mb-2" />
          <p className="mb-2">No posts logged yet.</p>
          <Link to="/posts/add" className="text-accent-dim font-semibold">Add your first post</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((p) => (
            <Link
              key={p.id}
              to={`/post/${p.id}`}
              className="bg-card rounded-xl3 shadow-card hover:shadow-cardhover transition-all px-4 py-3 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {p.brand && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent-wash text-accent-dim flex-shrink-0">
                      {p.brand}
                    </span>
                  )}
                  <p className="font-semibold text-[15px] truncate">{p.title || 'Untitled post'}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${VERDICT[p.verdict] || VERDICT.unsure}`}>
                    {p.verdict}
                  </span>
                </div>
                <p className="text-[12px] text-ink-soft truncate mt-0.5">
                  {[p.platform, p.post_type, p.posted_at, p.added_by_email && `by ${displayName(p.added_by_email)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="hidden sm:flex gap-4 text-right flex-shrink-0">
                {['views', 'likes', 'signups'].map((k) =>
                  metric(p, k) != null ? (
                    <div key={k}>
                      <p className="text-[15px] font-semibold tabular-nums leading-none">{metric(p, k)}</p>
                      <p className="text-[11px] text-ink-soft">{k}</p>
                    </div>
                  ) : null
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
