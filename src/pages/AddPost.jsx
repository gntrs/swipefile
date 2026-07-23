import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CaretLeft, UploadSimple } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'Other'];
const TYPES = ['post', 'story', 'reel', 'video', 'other'];
const VERDICTS = ['unsure', 'winner', 'testing', 'loser'];
const METRIC_KEYS = ['views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'signups'];

const field = 'w-full py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[14px]';
const label = 'text-[13px] font-semibold text-ink-soft mb-1 block';

export default function AddPost() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // /posts/add?competitor=1 comes from the competitors page.
  const [params] = useSearchParams();
  const fromCompetitors = params.get('competitor') === '1';
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [f, setF] = useState({
    brand: params.get('brand') || '',
    title: '',
    platform: 'Facebook',
    post_type: 'post',
    url: '',
    copy: '',
    posted_at: '',
    verdict: 'unsure',
    tags: '',
    notes: '',
  });
  const [metrics, setMetrics] = useState({});

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const setMetric = (k) => (e) =>
    setMetrics((prev) => ({ ...prev, [k]: e.target.value === '' ? undefined : Number(e.target.value) }));

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let media_path = null;
      if (file) {
        const ext = file.name.split('.').pop();
        const path = `${user.id}/post-${Date.now()}.${ext}`;
        const { error: upErr } = await db.storage.from('ad-media').upload(path, file);
        if (upErr) throw upErr;
        media_path = path;
      }
      const cleanMetrics = Object.fromEntries(
        Object.entries(metrics).filter(([, v]) => v !== undefined && !Number.isNaN(v))
      );
      const { data, error: insErr } = await db
        .from('posts')
        .insert({
          // Only send brand when set, so this still works before migration 8.
          ...(f.brand.trim() ? { brand: f.brand.trim() } : {}),
          title: f.title.trim() || null,
          platform: f.platform,
          post_type: f.post_type,
          url: f.url.trim() || null,
          copy: f.copy.trim() || null,
          posted_at: f.posted_at || null,
          verdict: f.verdict,
          tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
          metrics: cleanMetrics,
          notes: f.notes.trim() || null,
          media_path,
          added_by: user.id,
          added_by_email: user.email,
        })
        .select()
        .single();
      if (insErr) throw insErr;
      navigate(`/post/${data.id}`);
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[720px] mx-auto">
      <button onClick={() => navigate('/posts')} className="flex items-center gap-1 text-ink-soft text-[14px] font-medium mb-4">
        <CaretLeft size={16} weight="bold" /> Posts
      </button>
      <h1 className="text-[22px] font-semibold tracking-tight mb-5">
        {fromCompetitors ? 'Log a competitor post' : 'Log an organic post'}
      </h1>

      <form onSubmit={submit} className="grid gap-4">
        <div>
          <span className={label}>Whose post is it?</span>
          <input
            className={field}
            value={f.brand}
            onChange={set('brand')}
            placeholder="Leave empty for our own, or type the competitor brand"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <span className={label}>Title / hook</span>
            <input className={field} value={f.title} onChange={set('title')} placeholder="e.g. founder story reel" />
          </div>
          <div>
            <span className={label}>Link to the post</span>
            <input className={field} value={f.url} onChange={set('url')} placeholder="https://..." />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <span className={label}>Platform</span>
            <select className={field} value={f.platform} onChange={set('platform')}>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <span className={label}>Type</span>
            <select className={field} value={f.post_type} onChange={set('post_type')}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <span className={label}>Posted on</span>
            <input type="date" className={field} value={f.posted_at} onChange={set('posted_at')} />
          </div>
        </div>

        <div>
          <span className={label}>Post copy</span>
          <textarea className={`${field} min-h-[90px]`} value={f.copy} onChange={set('copy')} placeholder="Paste the caption / text..." />
        </div>

        {/* Metrics */}
        <div>
          <span className={label}>Results (fill what you know)</span>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {METRIC_KEYS.map((k) => (
              <div key={k}>
                <input
                  type="number"
                  min="0"
                  className={field}
                  value={metrics[k] ?? ''}
                  onChange={setMetric(k)}
                  placeholder="0"
                />
                <p className="text-[11px] text-ink-soft mt-0.5 text-center capitalize">{k}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <span className={label}>Verdict</span>
            <select className={field} value={f.verdict} onChange={set('verdict')}>
              {VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <span className={label}>Tags (comma separated)</span>
            <input className={field} value={f.tags} onChange={set('tags')} placeholder="fb-group, story, wave" />
          </div>
        </div>

        <div>
          <span className={label}>Notes</span>
          <textarea className={`${field} min-h-[60px]`} value={f.notes} onChange={set('notes')} placeholder="Anything worth remembering about this one..." />
        </div>

        {/* Optional screenshot */}
        <label className="block bg-card border-2 border-dashed border-line rounded-xl3 p-4 text-center cursor-pointer hover:border-coral transition-colors">
          {preview ? (
            <img src={preview} className="max-h-48 mx-auto rounded-2xl" alt="preview" />
          ) : (
            <div className="py-4 text-ink-soft">
              <UploadSimple size={22} className="mx-auto mb-1" />
              <p className="text-[13px] font-medium">Screenshot (optional)</p>
            </div>
          )}
          <input type="file" accept="image/*" onChange={onFile} className="hidden" />
        </label>

        {error && <p className="text-red-500 text-[13px]">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="press justify-self-start px-6 py-3 rounded-2xl bg-coral text-black font-semibold shadow-cta disabled:opacity-60"
        >
          {busy ? 'Saving...' : 'Save post'}
        </button>
      </form>
    </div>
  );
}
