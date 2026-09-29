import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db, IS_DEMO } from '@/lib/db';
import { VERDICTS } from '@/lib/ads';
import { APP_NAME } from '@/lib/brand';
import { saveAd } from '@/lib/saveAd';
import { useAuth } from '@/contexts/AuthContext';
import DemoBanner from '@/components/DemoBanner';
import { parseCaptureParams } from './params';
import {
  formFromCapture, adFromCapture, runningDatesPatch, readInvokeError, fetchMediaOutcome, daysRunning, MEDIA_TEXT,
} from './capture';

const kicker = 'font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft';
const field =
  'w-full min-h-[44px] py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-accent bg-canvas text-[16px] text-ink';
const label = 'font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft mb-1.5 block';
const primary =
  'press inline-flex items-center justify-center min-h-[44px] px-6 rounded-2xl bg-accent text-black font-semibold disabled:opacity-60';
const secondary =
  'press inline-flex items-center justify-center min-h-[44px] px-5 rounded-2xl border border-line font-semibold text-ink hover:bg-card disabled:opacity-60';

const PLATFORM_NAMES = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  messenger: 'Messenger',
  audience_network: 'Audience Network',
  threads: 'Threads',
  whatsapp: 'WhatsApp',
};

function fmtDay(day) {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// The facts the Ad Library showed, as one quiet line.
function Facts({ capture }) {
  const days = daysRunning(capture.started, capture.stopped);
  const parts = [];
  if (capture.libraryId) parts.push(`Library ID ${capture.libraryId}`);
  if (capture.active === true) parts.push('Active');
  if (capture.active === false) parts.push('Inactive');
  if (capture.started && capture.stopped) parts.push(`${fmtDay(capture.started)} to ${fmtDay(capture.stopped)}`);
  else if (capture.started) parts.push(`since ${fmtDay(capture.started)}`);
  if (days !== null) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (capture.platforms.length) parts.push(capture.platforms.map((p) => PLATFORM_NAMES[p] || p).join(', '));
  if (!parts.length) return null;
  return <p className="font-mono text-[12px] leading-relaxed text-ink-soft tabular-nums mt-3">{parts.join(' / ')}</p>;
}

// The first creative, hotlinked for the preview only. No referrer goes to
// Meta's CDN; when it does not load (links expire), say what happens next.
function MediaPreview({ capture }) {
  const [failed, setFailed] = useState(false);
  const src = capture.media[0];
  useEffect(() => {
    // <video> has no referrerPolicy attribute, so the page asks for none.
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  if (!src) return null;
  if (failed) {
    return (
      <p className="bg-card border border-line rounded-xl3 px-4 py-5 text-[15px] leading-relaxed text-ink-soft">
        Preview not available. The file is copied when you save, if fetch-media is deployed.
      </p>
    );
  }
  const isVideo = capture.kind === 'video' && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(src);
  return isVideo ? (
    <video
      src={src}
      controls
      muted
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className="block w-full max-h-[420px] rounded-xl3 bg-card object-contain"
    />
  ) : (
    <img
      src={src}
      alt="The ad's creative"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="block w-full max-h-[420px] rounded-xl3 bg-card object-contain"
    />
  );
}

function Shell({ children }) {
  return (
    <div data-page="capture" className="h-full overflow-y-auto overscroll-contain bg-canvas text-ink">
      <DemoBanner />
      <div className="max-w-[720px] mx-auto px-5 sm:px-8 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <Link to="/ads" className="press inline-flex items-center min-h-[44px] font-semibold text-[18px] tracking-tight mb-4">
          {APP_NAME}
          <span className="text-accent">.</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

function CloseTab() {
  const [stuck, setStuck] = useState(false);
  return (
    <>
      <button
        type="button"
        className={secondary}
        onClick={() => {
          window.close();
          // Only tabs a script opened can close themselves.
          setTimeout(() => setStuck(true), 300);
        }}
      >
        Close tab
      </button>
      {stuck && <p className="basis-full text-[14px] text-ink-soft">This tab did not open from capture, so close it yourself.</p>}
    </>
  );
}

// Where a captured ad lands: in its own tab, outside the app shell, behind a
// login. Shows an editable preview; nothing is saved until the person presses
// Save to swipefile.
export default function CapturePage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { capture, warnings } = useMemo(() => parseCaptureParams(params), [params]);
  const [form, setForm] = useState(() => formFromCapture(capture));
  const [existing, setExisting] = useState(capture.libraryId ? undefined : null); // undefined while checking
  const [lookupError, setLookupError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const [media, setMedia] = useState(null); // { busy, ok, message }
  const [dates, setDates] = useState(null); // { busy, ok, message }
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A new capture in the same tab starts over.
  useEffect(() => {
    setForm(formFromCapture(capture));
    setSaved(null);
    setMedia(null);
    setDates(null);
    setError('');
  }, [capture]);

  useEffect(() => {
    if (!capture.libraryId) {
      setExisting(null);
      return undefined;
    }
    let live = true;
    setExisting(undefined);
    setLookupError('');
    Promise.resolve()
      .then(() => db.from('ads').select('id, brand, hook, metrics, verdict').eq('metrics->>ad_library_id', capture.libraryId).limit(1))
      .then(({ data, error: err }) => {
        if (!live) return;
        if (err) {
          setLookupError(`Could not check whether this ad is already saved: ${err.message}`);
          setExisting(null);
          return;
        }
        setExisting(data?.[0] || null);
      })
      .catch((err) => {
        if (!live) return;
        setLookupError(`Could not check whether this ad is already saved: ${err?.message || err}`);
        setExisting(null);
      });
    return () => {
      live = false;
    };
  }, [capture.libraryId]);

  const empty =
    !capture.libraryId && !capture.brand && !capture.title && !capture.text && !capture.link && capture.media.length === 0;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const copyCreative = async (ad) => {
    setMedia({ busy: true, message: MEDIA_TEXT.copying });
    let outcome;
    try {
      const { data, error: err } = await db.functions.invoke('fetch-media', {
        body: { action: 'fetch', adId: ad.id, url: capture.media[0] },
      });
      outcome = fetchMediaOutcome({ data, error: err ? await readInvokeError(err) : null });
    } catch (err) {
      outcome = fetchMediaOutcome({ error: await readInvokeError(err) });
    }
    if (mounted.current) setMedia({ busy: false, ...outcome });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { ad } = await saveAd(adFromCapture(capture, form), { user });
      if (!mounted.current) return;
      setSaved(ad);
      if (capture.media.length && !IS_DEMO) copyCreative(ad);
    } catch (err) {
      if (mounted.current) setError(err?.message || 'Could not save the ad.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const updateDates = async () => {
    setDates({ busy: true, message: 'Updating...' });
    const metrics = runningDatesPatch(existing.metrics, capture);
    try {
      const { error: err } = await db.from('ads').update({ metrics }).eq('id', existing.id);
      if (err) throw err;
      setExisting((x) => ({ ...x, metrics }));
      setDates({ busy: false, ok: true, message: 'Running dates updated. The verdict is unchanged.' });
    } catch (err) {
      setDates({ busy: false, ok: false, message: `Could not update the running dates: ${err?.message || err}` });
    }
  };

  if (empty) {
    return (
      <Shell>
        <p className={kicker}>Capture</p>
        <h1 className="text-[26px] font-semibold tracking-tight leading-tight mt-1">Nothing to capture</h1>
        <p className="text-[16px] leading-relaxed text-ink-soft mt-3">
          This page opens from the bookmarklet or the extension, with an ad from the Meta Ad Library filled in.
        </p>
        <Link to="/capture/setup" className={`${primary} mt-6`}>
          Set up capture
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className={kicker}>Capture{capture.src ? ` from the ${capture.src}` : ''}</p>
      <h1 className="text-[26px] font-semibold tracking-tight leading-tight mt-1">
        {saved ? 'Saved to your swipe file' : existing ? 'Already in your swipe file' : 'Save this ad'}
      </h1>
      <Facts capture={capture} />
      {warnings.map((w) => (
        <p key={w} role="status" className="mt-3 text-[15px] leading-relaxed text-amber-600">
          {w}
        </p>
      ))}
      {lookupError && (
        <p role="alert" className="mt-3 text-[15px] leading-relaxed text-amber-600">
          {lookupError}
        </p>
      )}

      {saved ? (
        <div className="mt-6">
          <p className="text-[16px] leading-relaxed text-ink">
            {saved.brand || 'The ad'} is in your swipe file{saved.verdict !== 'unsure' ? ` as ${saved.verdict}` : ''}.
          </p>
          {IS_DEMO && <p className="mt-2 text-[15px] text-ink-soft">Demo: saved until you reload.</p>}
          {media && (
            <p role="status" className={`mt-3 text-[15px] leading-relaxed ${media.busy ? 'text-ink-soft' : media.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
              {media.message}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to={`/ad/${saved.id}`} className={primary}>
              Open ad
            </Link>
            <CloseTab />
          </div>
        </div>
      ) : existing ? (
        <div className="mt-6">
          <div className="bg-card border border-line rounded-xl3 px-5 py-4">
            <p className="text-[16px] font-semibold leading-snug">{existing.brand || 'Unnamed brand'}</p>
            {existing.hook && <p className="text-[16px] leading-relaxed text-ink-soft mt-1">{existing.hook}</p>}
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft mt-2">Verdict: {existing.verdict}</p>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            Update running dates copies only whether it runs, since when and on which platforms. Nothing else changes.
          </p>
          {dates && (
            <p role="status" className={`mt-3 text-[15px] leading-relaxed ${dates.busy ? 'text-ink-soft' : dates.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {dates.message}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to={`/ad/${existing.id}`} className={primary}>
              Open
            </Link>
            <button type="button" onClick={updateDates} disabled={dates?.busy || dates?.ok} className={secondary}>
              {dates?.busy ? 'Updating...' : 'Update running dates'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={save} className="mt-6 grid gap-5">
          <MediaPreview capture={capture} />
          <div className="grid sm:grid-cols-2 gap-5">
            <label className="block">
              <span className={label}>Brand</span>
              <input className={field} value={form.brand} onChange={set('brand')} />
            </label>
            <label className="block">
              <span className={label}>Platform</span>
              <select className={field} value={form.platform} onChange={set('platform')}>
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className={label}>Headline</span>
            <input className={field} value={form.hook} onChange={set('hook')} />
          </label>
          <label className="block">
            <span className={label}>Primary text</span>
            <textarea className={`${field} min-h-[140px] leading-relaxed`} value={form.ad_copy} onChange={set('ad_copy')} />
          </label>
          <div className="grid sm:grid-cols-2 gap-5">
            <label className="block">
              <span className={label}>Landing page</span>
              <input className={field} type="url" inputMode="url" value={form.landing_url} onChange={set('landing_url')} />
            </label>
            <label className="block">
              <span className={label}>Call to action</span>
              <input className={field} value={form.cta} onChange={set('cta')} />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <label className="block">
              <span className={label}>Verdict</span>
              <select className={field} value={form.verdict} onChange={set('verdict')}>
                {VERDICTS.map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Tags (comma separated)</span>
              <input className={field} value={form.tags} onChange={set('tags')} placeholder="ugc, offer" />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-[15px] leading-relaxed text-red-600">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy || existing === undefined} className={primary}>
              {busy ? 'Saving...' : existing === undefined ? 'Checking...' : 'Save to swipefile'}
            </button>
            {IS_DEMO && <p className="text-[14px] text-ink-soft">Demo: saved until you reload.</p>}
          </div>
        </form>
      )}
    </Shell>
  );
}
