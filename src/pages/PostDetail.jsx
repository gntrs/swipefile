import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash, PaperPlaneRight, ArrowSquareOut } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useMediaUrl } from '@/lib/media';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { RowsSkeleton } from '@/components/Skeleton';
import { compactNum } from '@/lib/format';
import { shortDate } from '@/features/ai/dates';
import {
  Page,
  PageHeader,
  Panel,
  Button,
  IconButton,
  Metrics,
  Meta,
  Badge,
  Field,
  EmptyState,
  GRID_SPLIT,
  inputCls,
  selectCls,
} from '@/components/ui';

const VERDICTS = ['unsure', 'winner', 'testing', 'loser'];
const METRIC_KEYS = ['views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'signups'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
      const { data } = await db.from('posts').select('*').eq('id', id).single();
      if (mounted) {
        setPost(data);
        setLoading(false);
      }
      const { data: c } = await db
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
    await db.from('posts').update(fields).eq('id', id);
  };

  const remove = async () => {
    if (!confirm('Delete this post?')) return;
    await db.from('posts').delete().eq('id', id);
    navigate('/posts');
  };

  const addComment = async (e) => {
    e.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    const { data } = await db
      .from('comments')
      .insert({ post_id: id, body, author_email: user.email, author_id: user.id })
      .select()
      .single();
    if (data) setComments((c) => [...c, data]);
    setNewComment('');
  };

  if (loading) {
    return (
      <Page id="post-detail">
        <RowsSkeleton rows={2} />
      </Page>
    );
  }
  if (!post) {
    return (
      <Page id="post-detail">
        <PageHeader back={{ to: '/posts', label: 'Posts' }} title="Post not found" />
        <EmptyState text="It may have been deleted, or the link is wrong." />
      </Page>
    );
  }

  const metrics = post.metrics || {};
  const metricItems = METRIC_KEYS.filter((k) => metrics[k] != null).map((k) => ({
    key: k,
    label: cap(k),
    value: compactNum(metrics[k]),
  }));
  const tags = Array.isArray(post.tags) ? post.tags : [];

  return (
    <Page id="post-detail">
      <PageHeader
        back={{ to: '/posts', label: 'Posts' }}
        title={post.title || 'Untitled post'}
        context={
          <Meta
            items={[
              post.brand && <span key="b" className="text-ink">{post.brand} (competitor)</span>,
              post.platform,
              post.post_type,
              shortDate(post.posted_at),
              post.added_by_email && `added by ${displayName(post.added_by_email)}`,
            ]}
          />
        }
        actions={
          <>
            {post.url && (
              <>
                <Button variant="ghost" href={post.url} target="_blank" rel="noreferrer" icon={ArrowSquareOut} className="hidden sm:inline-flex">
                  Open
                </Button>
                <IconButton label="Open" href={post.url} target="_blank" rel="noreferrer" icon={ArrowSquareOut} className="sm:hidden" />
              </>
            )}
            <Button variant="danger" onClick={remove} icon={Trash} className="hidden sm:inline-flex">
              Delete
            </Button>
            <IconButton label="Delete" variant="danger" onClick={remove} icon={Trash} className="sm:hidden" />
          </>
        }
      />

      <div className={GRID_SPLIT}>
        {/* Under lg both columns dissolve (contents) so the panels read in one
          order: results, verdict, copy, screenshot, notes. */}
        <div className="contents lg:flex lg:col-span-8 lg:flex-col lg:gap-6 min-w-0">
          {metricItems.length > 0 && (
            <Panel title="Results" className="order-1 lg:order-none">
              <Metrics items={metricItems} cols={3} className="sm:grid-cols-4 xl:grid-cols-5" />
            </Panel>
          )}

          {(post.copy || post.notes || tags.length > 0) && (
            <Panel title="Copy" className="order-3 lg:order-none">
              {post.copy && <p className="text-body text-ink whitespace-pre-wrap max-w-[68ch]">{post.copy}</p>}
              {post.notes && (
                <div className={post.copy ? 'mt-5' : ''}>
                  <p className="text-small font-medium text-ink-soft mb-1">Notes</p>
                  <p className="text-body text-ink whitespace-pre-wrap max-w-[68ch]">{post.notes}</p>
                </div>
              )}
              {tags.length > 0 && (
                <div className={`flex flex-wrap gap-1.5 ${post.copy || post.notes ? 'mt-5' : ''}`}>
                  {tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {src && (
            <Panel title="Screenshot" className="order-4 lg:order-none">
              <img src={src} alt="post screenshot" className="rounded-xl max-h-[32rem] max-w-full" />
            </Panel>
          )}
        </div>

        <div className="contents lg:flex lg:col-span-4 lg:flex-col lg:gap-6 min-w-0">
          <Panel className="order-2 lg:order-none">
            <Field label="Verdict" htmlFor="post-verdict">
              <select
                id="post-verdict"
                value={post.verdict}
                onChange={(e) => patch({ verdict: e.target.value })}
                className={selectCls}
              >
                {VERDICTS.map((v) => (
                  <option key={v} value={v}>
                    {cap(v)}
                  </option>
                ))}
              </select>
            </Field>
          </Panel>

          <Panel title="Team notes" flush className="order-5 lg:order-none">
            {comments.length === 0 ? (
              <p className="px-5 lg:px-6 text-body text-ink-soft">No notes yet.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {comments.map((c) => (
                  <li key={c.id} className="px-5 lg:px-6 py-3">
                    <p className="text-small font-semibold text-ink">{displayName(c.author_email)}</p>
                    <p className="text-body text-ink mt-0.5 whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addComment} className="flex gap-2 p-5 lg:p-6 pt-4 lg:pt-4">
              <label htmlFor="post-note" className="sr-only">
                Add a note for the team
              </label>
              <input
                id="post-note"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a note for the team..."
                className={`${inputCls} flex-1 min-w-0`}
              />
              <IconButton type="submit" label="Add note" variant="secondary" icon={<PaperPlaneRight size={18} weight="fill" aria-hidden="true" />} />
            </form>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
