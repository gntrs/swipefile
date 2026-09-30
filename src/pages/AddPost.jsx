import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UploadSimple } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { Page, PageHeader, Panel, Field, Button, Notice, inputCls, selectCls, textareaCls } from '@/components/ui';
import { MEDIA_BUCKET, mediaPathFor, validateFile, friendlyStorageError, removeMedia, uploadBody } from '@/lib/saveAd';

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'Other'];
const TYPES = ['post', 'story', 'reel', 'video', 'other'];
const VERDICTS = ['unsure', 'winner', 'testing', 'loser'];
const METRIC_KEYS = ['views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'signups'];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const onFile = (e) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    const invalid = validateFile(picked);
    if (invalid) {
      setError(invalid.message);
      return;
    }
    setError('');
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let media_path = null;
      if (file) {
        const path = mediaPathFor(user.id, file);
        const { error: upErr } = await db.storage.from(MEDIA_BUCKET).upload(path, uploadBody(file));
        if (upErr) throw new Error(friendlyStorageError(upErr, { size: file.size }));
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
      if (insErr) {
        // Do not leave the uploaded file behind when the row failed.
        if (media_path) await removeMedia(media_path);
        throw insErr;
      }
      navigate(`/post/${data.id}`);
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page id="add-post" width="narrow">
      <PageHeader back={{ to: '/posts', label: 'Posts' }} title={fromCompetitors ? 'Log a competitor post' : 'Log an organic post'} />

      <form onSubmit={submit} className="flex flex-col gap-4 lg:gap-6">
        <Panel title="The post">
          <div className="grid gap-5">
            <Field label="Whose post is it?" htmlFor="post-brand" hint="Leave empty for our own, or type the competitor brand.">
              <input id="post-brand" aria-describedby="post-brand-hint" className={inputCls} value={f.brand} onChange={set('brand')} placeholder="Our own" />
            </Field>

            <div className="grid sm:grid-cols-2 gap-5 sm:gap-4">
              <Field label="Title or hook" htmlFor="post-title">
                <input id="post-title" className={inputCls} value={f.title} onChange={set('title')} placeholder="e.g. founder story reel" />
              </Field>
              <Field label="Link to the post" htmlFor="post-url">
                <input id="post-url" className={inputCls} value={f.url} onChange={set('url')} placeholder="https://..." />
              </Field>
            </div>

            <div className="grid sm:grid-cols-3 gap-5 sm:gap-4">
              <Field label="Platform" htmlFor="post-platform">
                <select id="post-platform" className={selectCls} value={f.platform} onChange={set('platform')}>
                  {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Type" htmlFor="post-type">
                <select id="post-type" className={selectCls} value={f.post_type} onChange={set('post_type')}>
                  {TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
                </select>
              </Field>
              <Field label="Posted on" htmlFor="post-date">
                <input id="post-date" type="date" className={inputCls} value={f.posted_at} onChange={set('posted_at')} />
              </Field>
            </div>

            <Field label="Post copy" htmlFor="post-copy">
              <textarea id="post-copy" className={textareaCls} value={f.copy} onChange={set('copy')} placeholder="Paste the caption or text..." />
            </Field>
          </div>
        </Panel>

        <Panel title="Results" action={<span className="text-small text-ink-soft">Fill what you know</span>}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {METRIC_KEYS.map((k) => (
              <Field key={k} label={cap(k)} htmlFor={`post-metric-${k}`}>
                <input
                  id={`post-metric-${k}`}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  className={`${inputCls} num`}
                  value={metrics[k] ?? ''}
                  onChange={setMetric(k)}
                  placeholder="0"
                />
              </Field>
            ))}
          </div>
        </Panel>

        <Panel title="Labels and notes">
          <div className="grid gap-5">
            <div className="grid sm:grid-cols-2 gap-5 sm:gap-4">
              <Field label="Verdict" htmlFor="post-verdict">
                <select id="post-verdict" className={selectCls} value={f.verdict} onChange={set('verdict')}>
                  {VERDICTS.map((v) => <option key={v} value={v}>{cap(v)}</option>)}
                </select>
              </Field>
              <Field label="Tags" htmlFor="post-tags" hint="Comma separated">
                <input id="post-tags" aria-describedby="post-tags-hint" className={inputCls} value={f.tags} onChange={set('tags')} placeholder="fb-group, story, wave" />
              </Field>
            </div>

            <Field label="Notes" htmlFor="post-notes">
              <textarea id="post-notes" className={textareaCls} value={f.notes} onChange={set('notes')} placeholder="Anything worth remembering about this one..." />
            </Field>

            {/* Optional screenshot */}
            <div>
              <p className="text-small font-medium text-ink mb-2">Screenshot</p>
              <label className="flex flex-col items-center justify-center min-h-[7.5rem] border border-dashed border-line rounded-xl p-4 text-center cursor-pointer hover:border-ink-soft transition-colors focus-within:border-ink-soft">
                {preview ? (
                  <img src={preview} className="max-h-48 mx-auto rounded-xl" alt="preview" />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-ink-soft">
                    <UploadSimple size={22} aria-hidden="true" />
                    <span className="text-ui font-medium">Add a screenshot (optional)</span>
                  </span>
                )}
                <input type="file" accept="image/*" onChange={onFile} className="sr-only" data-probe-skip />
              </label>
            </div>
          </div>
        </Panel>

        {error && <Notice tone="bad">{error}</Notice>}

        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving...' : 'Save post'}
          </Button>
        </div>
      </form>
    </Page>
  );
}
