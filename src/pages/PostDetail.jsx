import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CaretLeft, Trash, PaperPlaneRight, ArrowSquareOut } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';
import { useMediaUrl } from '@/lib/media';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';

const VERDICTS = ['unsure', 'winner', 'testing', 'loser'];
const METRIC_KEYS = ['views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'signups'];

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { displayName } = useTeam();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const src = useMediaUrl(post?.media_path);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.from('posts').select('*').eq('id', id).single();
      if (mounted) {
        setPost(data);
        setLoading(false);
      }
      const { data: c } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', id)
        .order('created_at', { ascending: true });
      if (mounted) setComments(c || []);
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  const patch = async (fields) => {
    setPost((p) => ({ ...p, ...fields }));
    await supabase.from('posts').update(fields).eq('id', id);
  };

  const remove = async () => {
    if (!confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', id);
    navigate('/posts');
  };

  const addComment = async (e) => {
    e.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    const { data } = await supabase
      .from('comments')
      .insert({ post_id: id, body, author_email: user.email, author_id: user.id })
      .select()
      .single();
    if (data) setComments((c) => [...c, data]);
    setNewComment('');
  };

  if (loading) return <div className="p-8 text-ink-soft">Loading...</div>;
  if (!post) return <div className="p-8 text-ink-soft">Post not found.</div>;

  
  const metrics = post.metrics || {};
  const hasMetrics = METRIC_KEYS.some((k) => metrics[k] != null);

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[860px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/posts')} className="flex items-center gap-1 text-ink-soft text-[14px] font-medium">
          <CaretLeft size={16} weight="bold" /> Posts
        </button>
        <button onClick={remove} className="flex items-center gap-1 text-red-500 text-[14px] font-medium">
          <Trash size={16} weight="bold" /> Delete
        </button>
      </div>

      <div className="bg-card rounded-xl3 border border-line shadow-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-tight">{post.title || 'Untitled post'}</h1>
            <p className="text-ink-soft text-[14px] mt-0.5">
              {[post.brand && `by ${post.brand} (competitor)`, post.platform, post.post_type, post.posted_at]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {post.added_by_email && (
              <p className="text-ink-soft text-[13px] mt-0.5">Added by {displayName(post.added_by_email)}</p>
            )}
          </div>
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-coral-dark text-[14px] font-semibold flex-shrink-0"
            >
              Open <ArrowSquareOut size={16} weight="bold" />
            </a>
          )}
        </div>

        <div className="flex gap-3 mt-4 max-w-xs">
          <label className="flex-1">
            <span className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide block mb-1">Verdict</span>
            <select
              value={post.verdict}
              onChange={(e) => patch({ verdict: e.target.value })}
              className="w-full py-2 px-3 rounded-2xl border border-line bg-card focus:outline-none focus:border-coral text-[14px] capitalize"
            >
              {VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        </div>

        {hasMetrics && (
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mt-5">
            {METRIC_KEYS.map((k) =>
              metrics[k] != null ? (
                <div key={k} className="bg-cream rounded-2xl px-2 py-2.5 text-center">
                  <p className="text-[17px] font-semibold tabular-nums leading-none">{metrics[k]}</p>
                  <p className="text-[11px] text-ink-soft mt-1 capitalize">{k}</p>
                </div>
              ) : null
            )}
          </div>
        )}

        {post.copy && (
          <div className="mt-5">
            <p className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide mb-1">Copy</p>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{post.copy}</p>
          </div>
        )}

        {post.notes && (
          <div className="mt-4">
            <p className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide mb-1">Notes</p>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{post.notes}</p>
          </div>
        )}

        {Array.isArray(post.tags) && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {post.tags.map((t) => (
              <span key={t} className="text-[12px] px-2.5 py-1 rounded-full bg-cream text-ink-soft">{t}</span>
            ))}
          </div>
        )}

        {src && (
          <img src={src} alt="post screenshot" className="mt-5 rounded-2xl border border-line max-h-96" />
        )}
      </div>

      {/* Team notes */}
      <div className="mt-4 bg-card rounded-xl3 border border-line shadow-card p-4">
        <h3 className="font-semibold text-[15px] mb-3">Team notes</h3>
        <div className="flex flex-col gap-3 mb-3">
          {comments.length === 0 && <p className="text-ink-soft text-[13px]">No notes yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="bg-cream rounded-2xl px-3.5 py-2.5">
              <p className="text-[14px]">{c.body}</p>
              <p className="text-[11px] text-ink-soft mt-1">{displayName(c.author_email)}</p>
            </div>
          ))}
        </div>
        <form onSubmit={addComment} className="flex gap-2">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a note for the team..."
            className="flex-1 py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[14px]"
          />
          <button className="w-11 h-11 rounded-2xl bg-coral text-black flex items-center justify-center shadow-cta active:scale-95">
            <PaperPlaneRight size={18} weight="fill" />
          </button>
        </form>
      </div>
    </div>
  );
}
