import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db, IS_DEMO } from '@/lib/db';
import { VERDICTS } from '@/lib/ads';
import Wordmark from '@/components/Wordmark';
import { saveAd } from '@/lib/saveAd';
import { useAuth } from '@/contexts/AuthContext';
import DemoBanner from '@/components/DemoBanner';
import { parseCaptureParams } from './params';
import { Badge, Button, Field, Meta, Notice, Panel, inputCls, selectCls, textareaCls } from '@/components/ui';
import {
  formFromCapture, adFromCapture, runningDatesPatch, readInvokeError, fetchMediaOutcome, daysRunning, MEDIA_TEXT,
} from './capture';
import { byId } from '@/lib/byId';

const textarea = `${textareaCls} min-h-[140px]`;
const statusTone = (st) => (st.busy ? 'text-ink-soft' : st.ok ? 'text-emerald-300' : 'text-amber-300');
const VERDICT_TONE = { winner: 'good', loser: 'bad', testing: 'warn' };
const cap = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '');

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

// The facts the Ad Library showed, as one quiet line under the title. The
// library id is the one standalone number, so it gets the mono.
function Facts({ capture }) {
  const days = daysRunning(capture.started, capture.stopped);
  const parts = [];
  if (capture.libraryId)
    parts.push(
      <>
        Library ID <span className="num">{capture.libraryId}</span>
      </>
    );
  if (capture.active === true) parts.push('Active');
  if (capture.active === false) parts.push('Inactive');
  if (capture.started && capture.stopped) parts.push(`${fmtDay(capture.started)} to ${fmtDay(capture.stopped)}`);
  else if (capture.started) parts.push(`since ${fmtDay(capture.started)}`);
  if (days !== null) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (capture.platforms.length) parts.push(capture.platforms.map((p) => PLATFORM_NAMES[p] || p).join(', '));
  if (!parts.length) return null;
  return <Meta items={parts} />;
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
      <p className="bg-card rounded-xl3 px-5 py-5 text-body text-ink-soft">
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

// Its own tab, outside the app shell: the same 720 column as the setup check,
// with the demo line on the column's left edge at every width.
function Shell({ children }) {
  const column = 'mx-auto w-full max-w-[720px] px-[var(--gutter)]';
  return (
    <div data-page="capture" className="h-full overflow-y-auto overscroll-contain bg-canvas text-ink">
      <DemoBanner className={column} />
      <div className={`${column} pt-[calc(1.5rem+env(safe-area-inset-top))] lg:pt-10 pb-[calc(4rem+env(safe-area-inset-bottom))]`}>
        <Link to="/ads" className="press inline-flex items-center min-h-[44px] -ml-1 px-1 rounded-xl mb-8">
          <Wordmark />
        </Link>
        {children}
      </div>
    </div>
  );
}

// Title block of the standalone page: eyebrow, h1, one line of context.
function Head({ eyebrow, title, context }) {
  return (
    <header className="mb-6 lg:mb-8">
      <p className="label-mono mb-2">{eyebrow}</p>
      <h1 className="text-h1 text-ink text-balance">{title}</h1>
      {context && <div className="mt-2 text-body text-ink-soft max-w-[60ch]">{context}</div>}
    </header>
  );
}

function CloseTab() {
  const [stuck, setStuck] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          window.close();
          // Only tabs a script opened can close themselves.
          setTimeout(() => setStuck(true), 300);
        }}
      >
        Close tab
      </Button>
      {stuck && <p className="basis-full text-small text-ink-soft">This tab did not open from capture, so close it yourself.</p>}
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
      const { error: err } = await byId(db.from('ads').update({ metrics }), existing.id);
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
        <Head
          eyebrow="Capture"
          title="Nothing to capture"
          context="This page opens from the bookmarklet or the extension, with an ad from the Meta Ad Library filled in."
        />
        <Button variant="primary" to="/capture/setup">
          Set up capture
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <Head
        eyebrow={`Capture${capture.src ? ` from the ${capture.src}` : ''}`}
        title={saved ? 'Saved to your swipe file' : existing ? 'Already in your swipe file' : 'Save this ad'}
        context={<Facts capture={capture} />}
      />
      {(warnings.length > 0 || lookupError) && (
        <div className="-mt-2 mb-6 space-y-2">
          {warnings.map((w) => (
            <Notice key={w} tone="warn" role="status">
              {w}
            </Notice>
          ))}
          {lookupError && <Notice tone="warn">{lookupError}</Notice>}
        </div>
      )}

      {saved ? (
        <div>
          <p className="text-body text-ink">
            {saved.brand || 'The ad'} is in your swipe file{saved.verdict !== 'unsure' ? ` as ${saved.verdict}` : ''}.
          </p>
          {IS_DEMO && <p className="mt-2 text-small text-ink-soft">Demo: saved until you reload.</p>}
          {media && (
            <p role="status" className={`mt-3 text-ui ${statusTone(media)}`}>
              {media.message}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button variant="primary" to={`/ad/${saved.id}`}>
              Open ad
            </Button>
            <CloseTab />
          </div>
        </div>
      ) : existing ? (
        <div>
          <Panel>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className="text-title text-ink min-w-0">{existing.brand || 'Unnamed brand'}</p>
              {existing.verdict && <Badge tone={VERDICT_TONE[existing.verdict] || 'neutral'}>{cap(existing.verdict)}</Badge>}
            </div>
            {existing.hook && <p className="text-body text-ink-soft mt-1.5">{existing.hook}</p>}
          </Panel>
          <p className="mt-4 text-body text-ink-soft max-w-[60ch]">
            Update running dates copies only whether it runs, since when and on which platforms. Nothing else changes.
          </p>
          {dates && (
            <p role="status" className={`mt-3 text-ui ${dates.busy ? 'text-ink-soft' : dates.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {dates.message}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button variant="primary" to={`/ad/${existing.id}`}>
              Open
            </Button>
            <Button onClick={updateDates} disabled={dates?.busy || dates?.ok}>
              {dates?.busy ? 'Updating...' : 'Update running dates'}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={save} className="grid gap-5">
          <MediaPreview capture={capture} />
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Brand" htmlFor="cap-brand">
              <input id="cap-brand" className={inputCls} value={form.brand} onChange={set('brand')} />
            </Field>
            <Field label="Platform" htmlFor="cap-platform">
              <select id="cap-platform" className={selectCls} value={form.platform} onChange={set('platform')}>
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
              </select>
            </Field>
          </div>
          <Field label="Headline" htmlFor="cap-hook">
            <input id="cap-hook" className={inputCls} value={form.hook} onChange={set('hook')} />
          </Field>
          <Field label="Primary text" htmlFor="cap-copy">
            <textarea id="cap-copy" className={textarea} value={form.ad_copy} onChange={set('ad_copy')} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Landing page" htmlFor="cap-landing">
              <input id="cap-landing" className={inputCls} type="url" inputMode="url" value={form.landing_url} onChange={set('landing_url')} />
            </Field>
            <Field label="Call to action" htmlFor="cap-cta">
              <input id="cap-cta" className={inputCls} value={form.cta} onChange={set('cta')} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Verdict" htmlFor="cap-verdict">
              <select id="cap-verdict" className={selectCls} value={form.verdict} onChange={set('verdict')}>
                {VERDICTS.map((v) => (
                  <option key={v} value={v}>
                    {cap(v)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tags" htmlFor="cap-tags" hint="Comma separated">
              <input
                id="cap-tags"
                className={inputCls}
                value={form.tags}
                onChange={set('tags')}
                placeholder="ugc, offer"
                aria-describedby="cap-tags-hint"
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="text-ui text-red-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
            <Button type="submit" variant="primary" disabled={busy || existing === undefined}>
              {busy ? 'Saving...' : existing === undefined ? 'Checking...' : 'Save to swipefile'}
            </Button>
            <CloseTab />
            {IS_DEMO && <p className="basis-full text-small text-ink-soft">Demo: saved until you reload.</p>}
          </div>
        </form>
      )}
    </Shell>
  );
}
