import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
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
import { Page, PageHeader, Panel, Field, Button, IconButton, Notice, inputCls, selectCls, textareaCls } from '@/components/ui';

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'Other'];

const VERDICT_LABEL = { unsure: 'Unsure', winner: 'Winner', testing: 'Testing', loser: 'Loser' };

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
    <Page id="add-ad" onPaste={onPaste}>
      <div className="max-w-[720px] xl:max-w-none">
        <PageHeader back={{ to: '/ads', label: 'Library' }} title="Add an ad" />

        {/* One column up to xl, start from first. From xl the start panel
            sits left and the form right. */}
        <form onSubmit={submit} className="grid xl:grid-cols-12 items-start gap-4 lg:gap-6">
          <Panel title="Start from" className="xl:col-span-5 xl:sticky xl:top-6" bodyClassName="grid gap-5">
            <LinkPaste value={link} onChange={setLink} />

            <DropZone onFiles={addFiles} compact={items.length > 0}>
              {single && (
                <div className="relative p-3 pb-0">
                  {formatFor(single.file) === 'video' ? (
                    <video src={single.url} className="max-h-64 mx-auto rounded-xl" controls playsInline />
                  ) : (
                    <img src={single.url} className="max-h-64 mx-auto rounded-xl" alt="Preview of the ad" />
                  )}
                  <IconButton
                    label="Remove file"
                    icon={X}
                    variant="secondary"
                    onClick={() => removeItem(single)}
                    className="absolute top-4 right-4 !bg-canvas/90"
                  />
                </div>
              )}
              {batch && (
                <div className="px-4 pt-3">
                  <p className="text-small text-ink-soft mb-1">
                    {items.length} files, one ad each. The fields apply to all of them; each ad gets an empty hook to fill in later.
                  </p>
                  <BatchSave items={items} status={status} onRemove={removeItem} onRetry={(item) => submitBatch(item)} running={running} />
                </div>
              )}
            </DropZone>

            {rejected.length > 0 && (
              <ul role="alert" className="grid gap-1 text-small text-red-300">
                {rejected.map((r, i) => (
                  <li key={`${r.name}-${i}`}>{r.message.includes(r.name) ? r.message : `${r.name}: ${r.message}`}</li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="xl:col-span-7 grid gap-4 lg:gap-6 min-w-0">
            <Panel title="What it says" bodyClassName="grid gap-5">
              <div className="grid sm:grid-cols-2 gap-5 sm:gap-4">
                <Field label="Brand or competitor" htmlFor="add-brand">
                  <input id="add-brand" className={inputCls} value={f.brand} onChange={set('brand')} placeholder="e.g. Acme Labs" />
                </Field>
                <Field label="Platform" htmlFor="add-platform">
                  <select id="add-platform" className={selectCls} value={f.platform} onChange={set('platform')}>
                    {PLATFORMS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {canTrack && (
                <div className="flex items-center gap-1 -ml-3 -my-2 text-ui text-ink">
                  <SelectBox checked={track} onChange={setTrack} label="Also track this brand on Competitors" />
                  <span aria-hidden="true" onClick={() => setTrack((v) => !v)} className="cursor-pointer">
                    Also track this brand on Competitors
                  </span>
                </div>
              )}

              {!batch && (
                <>
                  <Field label="Hook" hint="The opening line or first 3 seconds" htmlFor="add-hook">
                    <input
                      id="add-hook"
                      className={inputCls}
                      value={f.hook}
                      onChange={set('hook')}
                      placeholder="e.g. The first line that stops the scroll"
                      aria-describedby="add-hook-hint"
                    />
                  </Field>
                  <Field label="Ad copy" htmlFor="add-copy">
                    <textarea id="add-copy" className={textareaCls} value={f.ad_copy} onChange={set('ad_copy')} placeholder="Paste the full primary text..." />
                  </Field>
                </>
              )}
            </Panel>

            <Panel title="Links and labels" bodyClassName="grid gap-5">
              <Field label="Ad link" hint="Ad Library or post URL" htmlFor="add-source">
                <input
                  id="add-source"
                  className={inputCls}
                  value={f.source_url}
                  onChange={set('source_url')}
                  placeholder="https://facebook.com/ads/library/..."
                  aria-describedby="add-source-hint"
                />
              </Field>
              {!batch && (
                <Field label="Landing page" htmlFor="add-landing">
                  <input id="add-landing" className={inputCls} value={f.landing_url} onChange={set('landing_url')} placeholder="https://..." />
                </Field>
              )}
              <Field label="Tags" hint="Comma separated" htmlFor="add-tags">
                <input
                  id="add-tags"
                  className={inputCls}
                  value={f.tags}
                  onChange={set('tags')}
                  placeholder="ugc, testimonial, offer"
                  aria-describedby="add-tags-hint"
                />
              </Field>
              <div className="grid sm:grid-cols-2 gap-5 sm:gap-4">
                <Field label="Verdict" htmlFor="add-verdict">
                  <select id="add-verdict" className={selectCls} value={f.verdict} onChange={set('verdict')}>
                    {VERDICTS.map((v) => (
                      <option key={v} value={v}>
                        {VERDICT_LABEL[v] || v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Status" htmlFor="add-status">
                  <select id="add-status" className={selectCls} value={f.status} onChange={set('status')}>
                    <option value="running">Running</option>
                    <option value="dead">Dead</option>
                    <option value="saved">Saved (inspiration)</option>
                  </select>
                </Field>
              </div>
            </Panel>

            {error && <Notice tone="bad">{error}</Notice>}
            {notice && (
              <Notice tone="warn">
                {notice.text}{' '}
                <Link to={`/ad/${notice.adId}`} className="underline underline-offset-4 decoration-ink-soft hover:decoration-ink text-ink">
                  Open the ad
                </Link>
              </Notice>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                {allSaved ? (
                  <Button variant="primary" to="/ads">
                    Open library
                  </Button>
                ) : (
                  <Button variant="primary" type="submit" disabled={busy || running} className="w-full sm:w-auto">
                    {busy || running ? 'Saving...' : saveLabel}
                  </Button>
                )}
                {IS_DEMO && <p className="text-small text-ink-soft">Demo: saved until you reload.</p>}
              </div>
              {summary && (
                <p role="status" className="mt-3 text-body text-ink">
                  {summary}{' '}
                  {!allSaved && (
                    <Link to="/ads" className="underline underline-offset-4 decoration-ink-soft hover:decoration-ink text-ink">
                      Open library
                    </Link>
                  )}
                </p>
              )}
            </div>
          </div>
        </form>
      </div>
    </Page>
  );
}
