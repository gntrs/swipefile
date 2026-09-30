// What a capture turns into: the form the capture page shows, the row saveAd
// writes, the patch "Update running dates" applies, and the sentences for the
// fetch-media result. Pure, and importable from plain Node (the longevity
// script shares daysRunning).
import { permalinkFor } from '../../lib/adlibrary.js';
import { humanVerdictPatch, VERDICTS } from '../../lib/ads.js';
import { daysRunning, startedIso } from './dates.js';

export { daysRunning, startedIso };

// The first capture in test/fixtures/adlibrary/results-3.expected.json, used
// by "Try it with a sample" on Capture setup. A test keeps the two equal.
export const SAMPLE_CAPTURE = {
  libraryId: '999900001234567',
  brand: 'Lumen Loop',
  pageId: '999900000000011',
  started: '2026-01-05',
  stopped: null,
  active: true,
  platforms: ['facebook', 'instagram', 'messenger'],
  title: 'Light that follows the sun',
  text: 'Your desk lamp is lying to you about the time.\nLumen Loop shifts from cool morning light to a warm evening glow on its own.',
  cta: 'Shop now',
  link: 'https://lumenloop.example/lamp?ref=adlib',
  kind: 'image',
  media: ['https://scontent.example-cdn.test/v/t45/lumenloop_lamp_1080.jpg'],
  versions: false,
};

export const platformFor = (platforms) =>
  Array.isArray(platforms) && platforms.length === 1 && platforms[0] === 'instagram' ? 'Instagram' : 'Facebook';

// The editable form the capture page starts from.
export function formFromCapture(capture) {
  const c = capture || {};
  return {
    brand: c.brand || '',
    hook: c.title || '',
    ad_copy: c.text || '',
    landing_url: c.link || '',
    cta: c.cta || '',
    platform: platformFor(c.platforms),
    verdict: 'unsure',
    tags: '',
  };
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

// metrics for a new row saved from a capture.
export function captureMetrics(capture, { cta, now = new Date() } = {}) {
  const c = capture || {};
  const at = now.toISOString();
  const id = c.libraryId || null;
  return compact({
    source: 'capture',
    capture_source: c.src === 'bookmarklet' || c.src === 'extension' ? c.src : null,
    captured_at: at,
    ad_library_id: id,
    ad_permalink: id ? permalinkFor(id) : null,
    source_url: id ? permalinkFor(id) : null,
    page_id: c.pageId || null,
    cta: (typeof cta === 'string' ? cta.trim() : c.cta) || null,
    platforms: Array.isArray(c.platforms) ? c.platforms : [],
    started_running: startedIso(c.started),
    stopped_running: c.stopped || null,
    live: typeof c.active === 'boolean' ? c.active : null,
    days_running: daysRunning(c.started, c.stopped, now),
    media_urls: Array.isArray(c.media) ? c.media : [],
    last_synced: at,
  });
}

// The fields saveAd gets for a capture and the (possibly edited) form. A
// verdict other than unsure is a person's call, so it carries the human mark.
export function adFromCapture(capture, form, { now = new Date() } = {}) {
  const c = capture || {};
  const f = form || formFromCapture(c);
  const verdict = VERDICTS.includes(f.verdict) ? f.verdict : 'unsure';
  let metrics = captureMetrics(c, { cta: f.cta, now });
  if (verdict !== 'unsure') metrics = humanVerdictPatch({ metrics }, verdict, now).metrics;
  return {
    brand: f.brand,
    hook: f.hook,
    ad_copy: f.ad_copy,
    landing_url: f.landing_url,
    platform: f.platform === 'Instagram' ? 'Instagram' : 'Facebook',
    format: c.kind === 'video' ? 'video' : 'image',
    verdict,
    status: c.active === false ? 'dead' : 'running',
    tags: f.tags,
    metrics,
  };
}

// "Update running dates" on an ad that is already saved: merges only the
// running facts into its metrics. Never the verdict, never anything else.
export function runningDatesPatch(existingMetrics, capture, now = new Date()) {
  const c = capture || {};
  const m = { ...(existingMetrics || {}) };
  const at = now.toISOString();
  if (c.started) m.started_running = startedIso(c.started);
  if (c.active === true) delete m.stopped_running;
  else if (c.stopped) m.stopped_running = c.stopped;
  if (typeof c.active === 'boolean') m.live = c.active;
  const startDay = c.started || (typeof m.started_running === 'string' ? m.started_running.slice(0, 10) : null);
  const days = daysRunning(startDay, c.active === true ? null : m.stopped_running, now);
  if (days !== null) m.days_running = days;
  if (Array.isArray(c.platforms) && c.platforms.length) m.platforms = c.platforms;
  m.last_synced = at;
  m.captured_at = at;
  if (c.src === 'bookmarklet' || c.src === 'extension') m.capture_source = c.src;
  return m;
}

export const MEDIA_TEXT = {
  copying: 'Copying the creative...',
  saved: 'Creative saved.',
  had: 'The ad already has a creative.',
  deploy: 'Deploy fetch-media to copy creatives automatically.',
  failed: (reason) =>
    `The ad is saved, but the creative could not be copied: ${String(reason || 'unknown error').replace(/[.\s]+$/, '')}. Add the file on the ad page.`,
};

// Reads what supabase-js hands back from functions.invoke into
// { status, code, message }. A FunctionsHttpError keeps the Response in
// `context`; a fetch or relay error has none.
export async function readInvokeError(error) {
  const res = error?.context;
  const status = typeof res?.status === 'number' ? res.status : null;
  let body = null;
  if (res && typeof res.clone === 'function') {
    try {
      body = await res.clone().json();
    } catch {
      body = null;
    }
  }
  return {
    status,
    name: error?.name || null,
    code: body?.error?.code || error?.code || null,
    message: body?.error?.message || body?.message || error?.message || null,
  };
}

// -> { ok, message } for the fetch-media call after a save.
export function fetchMediaOutcome({ data, error } = {}) {
  if (!error) {
    if (data?.ok) return { ok: true, message: data.skipped ? MEDIA_TEXT.had : MEDIA_TEXT.saved };
    const reason = data?.error?.message || 'fetch-media gave no answer';
    return { ok: false, message: MEDIA_TEXT.failed(reason) };
  }
  if (error.status === 404) return { ok: false, message: MEDIA_TEXT.deploy };
  if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') {
    return { ok: false, message: `${MEDIA_TEXT.failed('fetch-media could not be reached')} ${MEDIA_TEXT.deploy}` };
  }
  return { ok: false, message: MEDIA_TEXT.failed(error.message || error.code) };
}
