import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, MagnifyingGlass, Megaphone } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';
import { useTeam } from '@/contexts/TeamContext';

const PLATFORMS = ['all', 'Facebook', 'Instagram', 'TikTok', 'YouTube', 'Other'];

const VERDICT = {
  winner: 'bg-mint/30 text-emerald-700',
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
    supabase
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
    <div className="px-5 sm:px-8 py-6 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Organic posts</h1>
          <p className="text-ink-soft text-[14px]">{posts.length} logged</p>
        </div>
        <Link
          to="/posts/add"
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-coral text-black font-semibold shadow-cta active:scale-[0.98] transition-transform"
        >
          <PlusCircle size={20} weight="bold" /> Add post
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1 flex items-center gap-2 bg-card border border-line rounded-2xl px-3">
          <MagnifyingGlass size={18} className="text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, copy, tags..."
            className="w-full py-2.5 bg-transparent focus:outline-none text-[14px]"
          />
        </div>
        <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`flex-shrink-0 px-3 py-2 rounded-2xl text-[13px] font-semibold transition-colors ${
                platform === p ? 'bg-coral text-black' : 'bg-card border border-line text-ink-soft'
              }`}
            >
              {p === 'all' ? 'All' : p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-ink-soft">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-ink-soft">
          <Megaphone size={32} className="mx-auto mb-2" />
          <p className="mb-2">No posts logged yet.</p>
          <Link to="/posts/add" className="text-coral-dark font-semibold">Add your first post</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((p) => (
            <Link
              key={p.id}
              to={`/post/${p.id}`}
              className="bg-card rounded-xl3 border border-line shadow-card hover:shadow-cardhover transition-all px-4 py-3 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {p.brand && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-coral-soft text-coral-dark flex-shrink-0">
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
