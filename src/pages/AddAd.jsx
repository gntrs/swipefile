import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadSimple, CaretLeft } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'Other'];
const VERDICTS = ['unsure', 'winner', 'testing', 'loser'];

const field = 'w-full py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[14px]';
const label = 'text-[13px] font-semibold text-ink-soft mb-1 block';

export default function AddAd() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [f, setF] = useState({
    brand: '',
    platform: 'Facebook',
    hook: '',
    ad_copy: '',
    landing_url: '',
    source_url: '',
    verdict: 'unsure',
    status: 'running',
    tags: '',
  });

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

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
      let format = 'image';
      if (file) {
        format = file.type.startsWith('video') ? 'video' : 'image';
        const ext = file.name.split('.').pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await db.storage.from('ad-media').upload(path, file);
        if (upErr) throw upErr;
        media_path = path;
      }

      const { data, error: insErr } = await db
        .from('ads')
        .insert({
          brand: f.brand.trim() || null,
          platform: f.platform,
          format,
          hook: f.hook.trim() || null,
          ad_copy: f.ad_copy.trim() || null,
          landing_url: f.landing_url.trim() || null,
          verdict: f.verdict,
          status: f.status,
          tags: f.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          // Link to the ad itself (Meta Ad Library, TikTok, a post url...).
          // Lives in metrics jsonb so no schema change is needed.
          metrics: f.source_url.trim() ? { source_url: f.source_url.trim() } : {},
          media_path,
          added_by: user.id,
          added_by_email: user.email,
        })
        .select()
        .single();
      if (insErr) throw insErr;
      navigate(`/ad/${data.id}`);
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[720px] mx-auto">
      <button
        onClick={() => navigate('/ads')}
        className="flex items-center gap-1 text-ink-soft text-[14px] font-medium mb-4"
      >
        <CaretLeft size={16} weight="bold" /> Library
      </button>
      <h1 className="text-[22px] font-semibold tracking-tight mb-5">Add an ad</h1>

      <form onSubmit={submit} className="grid gap-4">
        {/* Media */}
        <label className="block bg-card border-2 border-dashed border-line rounded-xl3 p-5 text-center cursor-pointer hover:border-coral transition-colors">
          {preview ? (
            file?.type.startsWith('video') ? (
              <video src={preview} className="max-h-64 mx-auto rounded-2xl" controls playsInline />
            ) : (
              <img src={preview} className="max-h-64 mx-auto rounded-2xl" alt="preview" />
            )
          ) : (
            <div className="py-8 text-ink-soft">
              <UploadSimple size={28} className="mx-auto mb-2" />
              <p className="font-medium text-[14px]">Upload the ad image or video</p>
              <p className="text-[12px]">PNG, JPG, MP4...</p>
            </div>
          )}
          <input type="file" accept="image/*,video/*" onChange={onFile} className="hidden" />
        </label>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <span className={label}>Brand / competitor</span>
            <input className={field} value={f.brand} onChange={set('brand')} placeholder="e.g. Acme Labs" />
          </div>
          <div>
            <span className={label}>Platform</span>
            <select className={field} value={f.platform} onChange={set('platform')}>
              {PLATFORMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className={label}>Hook (the opening line / first 3 seconds)</span>
          <input className={field} value={f.hook} onChange={set('hook')} placeholder="e.g. The first line that stops the scroll" />
        </div>

        <div>
          <span className={label}>Ad copy</span>
          <textarea className={`${field} min-h-[90px]`} value={f.ad_copy} onChange={set('ad_copy')} placeholder="Paste the full primary text..." />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <span className={label}>Ad link (Ad Library, post url...)</span>
            <input className={field} value={f.source_url} onChange={set('source_url')} placeholder="https://facebook.com/ads/library/..." />
          </div>
          <div>
            <span className={label}>Landing URL</span>
            <input className={field} value={f.landing_url} onChange={set('landing_url')} placeholder="https://..." />
          </div>
        </div>

        <div>
          <span className={label}>Tags (comma separated)</span>
          <input className={field} value={f.tags} onChange={set('tags')} placeholder="ugc, testimonial, brain" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <span className={label}>Verdict</span>
            <select className={field} value={f.verdict} onChange={set('verdict')}>
              {VERDICTS.map((v) => (
                <option key={v} value={v} className="capitalize">
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={label}>Status</span>
            <select className={field} value={f.status} onChange={set('status')}>
              <option value="running">Running</option>
              <option value="dead">Dead</option>
              <option value="saved">Saved (inspiration)</option>
            </select>
          </div>
        </div>

        {error && <p className="text-red-500 text-[13px]">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="press justify-self-start px-6 py-3 rounded-2xl bg-coral text-black font-semibold shadow-cta disabled:opacity-60"
        >
          {busy ? 'Saving...' : 'Save ad'}
        </button>
      </form>
    </div>
  );
}
