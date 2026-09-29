import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CaretLeft, X } from '@phosphor-icons/react';
import { db, IS_DEMO } from '@/lib/db';
import { VERDICTS, humanVerdictPatch } from '@/lib/ads';
import { isOwnBrand } from '@/lib/brand';
import { isOn } from '@/lib/modules';
import { saveAd, validateFile, formatFor } from '@/lib/saveAd';
import { useAuth } from '@/contexts/AuthContext';
import LinkPaste, { EMPTY_LINK, linkMetrics } from '@/features/save/LinkPaste';
import DropZone from '@/features/save/DropZone';
import BatchSave from '@/features/save/BatchSave';
import SelectBox from '@/features/save/SelectBox';

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'Other'];

const field = 'w-full min-h-[44px] py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-accent bg-canvas text-[16px] sm:text-[14px]';
const label = 'text-[13px] font-semibold text-ink-soft mb-1 block';

let fileKey = 0;

// Add an ad: paste its Ad Library link, drop its image or video (or several,
// one ad each), fill in what you know. Everything saves through saveAd.
export default function AddAd() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [link, setLink] = useState(EMPTY_LINK);
  const [items, setItems] = useState([]); // { key, file, url }
  const [rejected, setRejected] = useState([]); // { name, message }
  const [status, setStatusState] = useState({}); // key -> { state, adId, message }
  const statusRef = useRef({});
  const setStatus = (update) => {
    statusRef.current = typeof update === 'function' ? update(statusRef.current) : update;
    setStatusState(statusRef.current);
  };
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null); // { text, adId }
  const [track, setTrack] = useState(true);
  const [summary, setSummary] = useState('');
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

  // Object URLs for previews are released when a file goes and on leaving.
  const urls = useRef(new Set());
  useEffect(
    () => () => {
      for (const u of urls.current) URL.revokeObjectURL(u);
      urls.current.clear();
    },
    []
  );
  const release = (item) => {
    if (item?.url) {
      URL.revokeObjectURL(item.url);
      urls.current.delete(item.url);
    }
  };

  const addFiles = useCallback((files) => {
    const good = [];
    const bad = [];
    for (const file of files) {
      const invalid = validateFile(file);
      if (invalid) bad.push({ name: file.name || 'Pasted file', message: invalid.message });
      else {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        good.push({ key: `f${++fileKey}`, file, url });
      }
    }
    setRejected(bad);
    setError('');
    setNotice(null);
    if (!good.length) return;
    // Files already saved in an earlier batch make room for the new ones.
    setItems((cur) => {
      const keep = [];
      for (const i of cur) {
        if (statusRef.current[i.key]?.state === 'saved') release(i);
        else keep.push(i);
      }
      return [...keep, ...good];
    });
    setSummary('');
  }, []);

  const removeItem = (item) => {
    release(item);
    setItems((cur) => cur.filter((i) => i.key !== item.key));
  };

  // Paste an image anywhere on the page. Text pastes are left alone.
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  };

  // A valid link fills the source field when it is empty.
  useEffect(() => {
    if (link.kind === 'ok') setF((prev) => (prev.source_url.trim() ? prev : { ...prev, source_url: link.parsed.permalink }));
  }, [link.kind, link.parsed]);

  const batch = items.length > 1;
  const single = items.length === 1 ? items[0] : null;
  const canTrack = isOn('competitors') && f.brand.trim() && !isOwnBrand(f.brand);

  const metricsFor = () => {
    const m = { ...linkMetrics(link) };
    const source = f.source_url.trim();
    if (source && !(link.kind === 'ok' && source === link.parsed.permalink)) m.source_url = source;
    // Picking a verdict here is a person's call: importers never move it.
    if (f.verdict !== 'unsure') Object.assign(m, humanVerdictPatch(null, f.verdict).metrics);
    return m;
  };

  // Track the brand on Competitors. A failure is said, never blocks the ad.
  const trackBrand = async () => {
    if (!canTrack || !track) return '';
    try {
      const { error: e } = await db
        .from('competitors')
        .upsert({ brand: f.brand.trim(), added_by_email: user.email }, { onConflict: 'brand', ignoreDuplicates: true });
      return e ? `Could not track ${f.brand.trim()} on Competitors: ${e.message}` : '';
    } catch (err) {
      return `Could not track ${f.brand.trim()} on Competitors: ${err?.message || err}`;
    }
  };

  const submitSingle = async () => {
    setBusy(true);
    setError('');
    try {
      const { ad } = await saveAd({ ...f, metrics: metricsFor() }, { user, file: single?.file || null });
      const trackError = await trackBrand();
      if (trackError) {
        setNotice({ text: `Saved the ad. ${trackError}`, adId: ad.id });
        return;
      }
      navigate(`/ad/${ad.id}`);
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const saveOne = async (item, metrics) => {
    setStatus((s) => ({ ...s, [item.key]: { state: 'saving' } }));
    try {
      const { ad } = await saveAd(
        { brand: f.brand, platform: f.platform, verdict: f.verdict, status: f.status, tags: f.tags, hook: '', metrics },
        { user, file: item.file }
      );
      setStatus((s) => ({ ...s, [item.key]: { state: 'saved', adId: ad.id } }));
      return true;
    } catch (err) {
      setStatus((s) => ({ ...s, [item.key]: { state: 'failed', message: err.message || 'Could not save.' } }));
      return false;
    }
  };

  const submitBatch = async (only = null) => {
    setRunning(true);
    setError('');
    setSummary('');
    const metrics = metricsFor();
    const todo = only ? [only] : items.filter((i) => status[i.key]?.state !== 'saved');
    // One at a time, so one failure never stops the rest.
    for (const item of todo) await saveOne(item, metrics);
    const trackError = await trackBrand();
    setRunning(false);
    const s = statusRef.current;
    const saved = items.filter((i) => s[i.key]?.state === 'saved').length;
    const failed = items.filter((i) => s[i.key]?.state === 'failed').length;
    setSummary(`Saved ${saved} ${saved === 1 ? 'ad' : 'ads'}.${failed ? ` ${failed} failed.` : ''}${trackError ? ` ${trackError}` : ''}`);
  };

  const submit = (e) => {
    e.preventDefault();
    if (batch) submitBatch();
    else submitSingle();
  };

  const allSaved = batch && items.every((i) => status[i.key]?.state === 'saved');
  const saveLabel = batch
    ? `Save ${items.filter((i) => status[i.key]?.state !== 'saved').length} ads`
    : link.duplicate
      ? 'Save a second copy'
      : 'Save ad';

  return (
    <div data-page="add-ad" onPaste={onPaste} className="px-5 sm:px-8 py-6 max-w-[720px] mx-auto">
      <button
        type="button"
        onClick={() => navigate('/ads')}
        className="press flex items-center gap-1 min-h-[44px] text-ink-soft text-[14px] font-medium mb-2"
      >
        <CaretLeft size={16} weight="bold" /> Library
      </button>
      <h1 className="text-[22px] font-semibold tracking-tight mb-5">Add an ad</h1>

      <form onSubmit={submit} className="grid gap-4">
        <LinkPaste value={link} onChange={setLink} />

        {/* Media */}
        <DropZone onFiles={addFiles} compact={items.length > 0}>
          {single && (
            <div className="relative p-3 pb-0">
              {formatFor(single.file) === 'video' ? (
                <video src={single.url} className="max-h-64 mx-auto rounded-2xl" controls playsInline />
              ) : (
                <img src={single.url} className="max-h-64 mx-auto rounded-2xl" alt="Preview of the ad" />
              )}
              <button
                type="button"
                onClick={() => removeItem(single)}
                aria-label="Remove file"
                className="press absolute top-4 right-4 w-11 h-11 rounded-full bg-canvas/85 border border-line flex items-center justify-center text-ink"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          )}
          {batch && (
            <div className="p-3 pb-0">
              <p className="text-[14px] text-ink-soft mb-2">
                {items.length} files, one ad each. The fields below apply to all of them; each ad gets an empty hook to fill in later.
              </p>
              <BatchSave items={items} status={status} onRemove={removeItem} onRetry={(item) => submitBatch(item)} running={running} />
            </div>
          )}
        </DropZone>

        {rejected.length > 0 && (
          <ul role="alert" className="grid gap-1 text-[14px] text-red-400">
            {rejected.map((r, i) => (
              <li key={`${r.name}-${i}`}>{r.message.includes(r.name) ? r.message : `${r.name}: ${r.message}`}</li>
            ))}
          </ul>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="add-brand" className={label}>Brand / competitor</label>
            <input id="add-brand" className={field} value={f.brand} onChange={set('brand')} placeholder="e.g. Acme Labs" />
          </div>
          <div>
            <label htmlFor="add-platform" className={label}>Platform</label>
            <select id="add-platform" className={field} value={f.platform} onChange={set('platform')}>
              {PLATFORMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {canTrack && (
          <div className="flex items-center gap-1 -ml-3 text-[15px] text-ink">
            <SelectBox checked={track} onChange={setTrack} label="Also track this brand on Competitors" />
            <span aria-hidden="true" onClick={() => setTrack((v) => !v)} className="cursor-pointer">
              Also track this brand on Competitors
            </span>
          </div>
        )}

        {!batch && (
          <>
            <div>
              <label htmlFor="add-hook" className={label}>Hook (the opening line / first 3 seconds)</label>
              <input id="add-hook" className={field} value={f.hook} onChange={set('hook')} placeholder="e.g. The first line that stops the scroll" />
            </div>

            <div>
              <label htmlFor="add-copy" className={label}>Ad copy</label>
              <textarea id="add-copy" className={`${field} min-h-[90px]`} value={f.ad_copy} onChange={set('ad_copy')} placeholder="Paste the full primary text..." />
            </div>
          </>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="add-source" className={label}>Ad link (Ad Library, post url...)</label>
            <input id="add-source" className={field} value={f.source_url} onChange={set('source_url')} placeholder="https://facebook.com/ads/library/..." />
          </div>
          {!batch && (
            <div>
              <label htmlFor="add-landing" className={label}>Landing URL</label>
              <input id="add-landing" className={field} value={f.landing_url} onChange={set('landing_url')} placeholder="https://..." />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="add-tags" className={label}>Tags (comma separated)</label>
          <input id="add-tags" className={field} value={f.tags} onChange={set('tags')} placeholder="ugc, testimonial, offer" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="add-verdict" className={label}>Verdict</label>
            <select id="add-verdict" className={`${field} capitalize`} value={f.verdict} onChange={set('verdict')}>
              {VERDICTS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="add-status" className={label}>Status</label>
            <select id="add-status" className={field} value={f.status} onChange={set('status')}>
              <option value="running">Running</option>
              <option value="dead">Dead</option>
              <option value="saved">Saved (inspiration)</option>
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-red-400 text-[15px]">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-amber-400 text-[15px]">
            {notice.text}{' '}
            <Link to={`/ad/${notice.adId}`} className="underline underline-offset-2 text-accent-dim">
              Open the ad
            </Link>
          </p>
        )}

        <div>
          {allSaved ? (
            <Link to="/ads" className="press inline-flex items-center min-h-[44px] px-6 py-3 rounded-2xl bg-accent text-black font-semibold">
              Open library
            </Link>
          ) : (
            <button
              type="submit"
              disabled={busy || running}
              className="press min-h-[44px] px-6 py-3 rounded-2xl bg-accent text-black font-semibold shadow-cta disabled:opacity-60"
            >
              {busy || running ? 'Saving...' : saveLabel}
            </button>
          )}
          {summary && (
            <p role="status" className="mt-3 text-[15px] text-ink">
              {summary}{' '}
              {!allSaved && (
                <Link to="/ads" className="underline underline-offset-2 text-accent-dim">
                  Open library
                </Link>
              )}
            </p>
          )}
          {IS_DEMO && <p className="mt-2 text-[13px] text-ink-soft">Demo: saved until you reload.</p>}
        </div>
      </form>
    </div>
  );
}
