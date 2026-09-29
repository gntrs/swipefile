import { describe, it, expect } from 'vitest';
import {
  daysRunning, startedIso, platformFor, formFromCapture, captureMetrics, adFromCapture, runningDatesPatch,
  readInvokeError, fetchMediaOutcome, MEDIA_TEXT, SAMPLE_CAPTURE,
} from '../../src/features/capture/capture.js';
import { isAutoVerdict } from '../../src/lib/ads.js';

const NOW = new Date('2026-09-29T10:00:00Z');

describe('daysRunning', () => {
  it('counts whole days to stopped, or to now while running', () => {
    expect(daysRunning('2026-09-01', null, NOW)).toBe(28);
    expect(daysRunning('2025-11-02', '2025-12-14', NOW)).toBe(42);
    expect(daysRunning('2026-09-29', null, NOW)).toBe(0);
  });
  it('is null without a start, never negative', () => {
    expect(daysRunning(null, null, NOW)).toBeNull();
    expect(daysRunning('garbage', null, NOW)).toBeNull();
    expect(daysRunning('2026-10-05', null, NOW)).toBe(0);
    expect(daysRunning('2026-03-01', '2026-02-01', NOW)).toBe(0);
  });
  it('reads an ISO timestamp start too', () => {
    expect(daysRunning('2026-09-01T00:00:00.000Z', null, NOW)).toBe(28);
  });
});

describe('small helpers', () => {
  it('startedIso and platformFor', () => {
    expect(startedIso('2026-01-05')).toBe('2026-01-05T00:00:00.000Z');
    expect(startedIso(null)).toBeNull();
    expect(platformFor(['instagram'])).toBe('Instagram');
    expect(platformFor(['instagram', 'threads'])).toBe('Facebook');
    expect(platformFor([])).toBe('Facebook');
    expect(platformFor(undefined)).toBe('Facebook');
  });
  it('formFromCapture maps title to hook and text to ad copy, verdict unsure', () => {
    expect(formFromCapture(SAMPLE_CAPTURE)).toEqual({
      brand: 'Lumen Loop',
      hook: 'Light that follows the sun',
      ad_copy: SAMPLE_CAPTURE.text,
      landing_url: 'https://lumenloop.example/lamp?ref=adlib',
      cta: 'Shop now',
      platform: 'Facebook',
      verdict: 'unsure',
      tags: '',
    });
    expect(formFromCapture(null).brand).toBe('');
  });
});

describe('captureMetrics', () => {
  it('writes every capture key and nothing empty', () => {
    const m = captureMetrics({ ...SAMPLE_CAPTURE, src: 'bookmarklet' }, { now: NOW });
    expect(m).toEqual({
      source: 'capture',
      capture_source: 'bookmarklet',
      captured_at: NOW.toISOString(),
      ad_library_id: '999900001234567',
      ad_permalink: 'https://www.facebook.com/ads/library/?id=999900001234567',
      source_url: 'https://www.facebook.com/ads/library/?id=999900001234567',
      page_id: '999900000000011',
      cta: 'Shop now',
      platforms: ['facebook', 'instagram', 'messenger'],
      started_running: '2026-01-05T00:00:00.000Z',
      live: true,
      days_running: 267,
      media_urls: SAMPLE_CAPTURE.media,
      last_synced: NOW.toISOString(),
    });
  });
  it('an inactive ad carries stopped_running and live false', () => {
    const m = captureMetrics({ started: '2025-11-02', stopped: '2025-12-14', active: false }, { now: NOW });
    expect(m).toMatchObject({ stopped_running: '2025-12-14', live: false, days_running: 42 });
  });
  it('without an id there is no permalink, and an edited cta wins', () => {
    const m = captureMetrics({ cta: 'Shop now' }, { cta: ' Order now ', now: NOW });
    expect(m.ad_library_id).toBeUndefined();
    expect(m.source_url).toBeUndefined();
    expect(m.cta).toBe('Order now');
    expect(m.capture_source).toBeUndefined();
  });
});

describe('adFromCapture', () => {
  it('builds saveAd fields from the capture and form', () => {
    const fields = adFromCapture({ ...SAMPLE_CAPTURE, src: 'extension' }, formFromCapture(SAMPLE_CAPTURE), { now: NOW });
    expect(fields).toMatchObject({
      brand: 'Lumen Loop', hook: 'Light that follows the sun', platform: 'Facebook', format: 'image',
      verdict: 'unsure', status: 'running', tags: '',
    });
    expect(fields.metrics.verdict_by).toBeUndefined();
    expect(fields.metrics.source).toBe('capture');
  });
  it('a verdict other than unsure is marked human, so importers leave it', () => {
    const form = { ...formFromCapture(SAMPLE_CAPTURE), verdict: 'winner' };
    const fields = adFromCapture(SAMPLE_CAPTURE, form, { now: NOW });
    expect(fields.verdict).toBe('winner');
    expect(fields.metrics).toMatchObject({ verdict_by: 'human', verdict_at: NOW.toISOString(), source: 'capture' });
    expect(isAutoVerdict({ verdict: fields.verdict, metrics: fields.metrics })).toBe(false);
  });
  it('video kind, inactive status, Instagram platform, unknown verdict falls back', () => {
    const c = { kind: 'video', active: false, platforms: ['instagram'] };
    const fields = adFromCapture(c, { ...formFromCapture(c), verdict: 'great' }, { now: NOW });
    expect(fields).toMatchObject({ format: 'video', status: 'dead', platform: 'Instagram', verdict: 'unsure' });
  });
  it('works without a form', () => {
    expect(adFromCapture(SAMPLE_CAPTURE, null, { now: NOW }).brand).toBe('Lumen Loop');
  });
});

describe('runningDatesPatch', () => {
  const existing = {
    ad_library_id: '999900002345678', started_running: '2025-11-02T00:00:00.000Z', live: true, days_running: 10,
    spend: 12, auto_verdict: 'testing', verdict_by: 'human', verdict_at: '2026-01-01T00:00:00.000Z', cta: 'Learn more',
  };

  it('merges only the running facts and keeps everything else', () => {
    const m = runningDatesPatch(existing, {
      src: 'bookmarklet', started: '2025-11-02', stopped: '2025-12-14', active: false, platforms: ['facebook'], cta: 'Buy',
      brand: 'Other', title: 'Other',
    }, NOW);
    expect(m).toEqual({
      ...existing,
      started_running: '2025-11-02T00:00:00.000Z',
      stopped_running: '2025-12-14',
      live: false,
      days_running: 42,
      platforms: ['facebook'],
      last_synced: NOW.toISOString(),
      captured_at: NOW.toISOString(),
      capture_source: 'bookmarklet',
    });
    expect(m.verdict_by).toBe('human');
    expect(m.cta).toBe('Learn more');
  });

  it('an ad running again loses its stopped date', () => {
    const m = runningDatesPatch({ ...existing, stopped_running: '2025-12-14', live: false }, { active: true }, NOW);
    expect(m.stopped_running).toBeUndefined();
    expect(m.live).toBe(true);
    expect(m.days_running).toBe(331);
  });

  it('a capture with no dates only stamps the sync times', () => {
    const m = runningDatesPatch(existing, {}, NOW);
    expect(m.started_running).toBe(existing.started_running);
    expect(m.live).toBe(true);
    expect(m.last_synced).toBe(NOW.toISOString());
    expect(m.capture_source).toBeUndefined();
  });

  it('does not mutate the metrics it was given', () => {
    const copy = JSON.parse(JSON.stringify(existing));
    runningDatesPatch(existing, { active: false, stopped: '2026-01-01' }, NOW);
    expect(existing).toEqual(copy);
  });

  it('handles missing metrics', () => {
    expect(runningDatesPatch(null, { started: '2026-09-01' }, NOW)).toMatchObject({ days_running: 28 });
  });
});

describe('fetch-media outcome', () => {
  const httpError = (status, body) => ({
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), { status }),
  });

  it('reads the status and the function error from an http error', async () => {
    const e = await readInvokeError(httpError(403, { ok: false, error: { code: 'host_not_allowed', message: 'That host is not allowed.' } }));
    expect(e).toEqual({ status: 403, name: 'FunctionsHttpError', code: 'host_not_allowed', message: 'That host is not allowed.' });
  });

  it('reads a fetch error with no response', async () => {
    const e = await readInvokeError({ name: 'FunctionsFetchError', message: 'Failed to send a request' });
    expect(e).toEqual({ status: null, name: 'FunctionsFetchError', code: null, message: 'Failed to send a request' });
    expect(await readInvokeError(undefined)).toEqual({ status: null, name: null, code: null, message: null });
  });

  it('a body that is not JSON falls back to the error message', async () => {
    const e = await readInvokeError({ name: 'FunctionsHttpError', message: 'boom', context: new Response('<html>', { status: 500 }) });
    expect(e.message).toBe('boom');
  });

  it('maps every case to a sentence', async () => {
    expect(fetchMediaOutcome({ data: { ok: true, path: 'u/1.jpg' } })).toEqual({ ok: true, message: MEDIA_TEXT.saved });
    expect(fetchMediaOutcome({ data: { ok: true, skipped: 'has_media' } })).toEqual({ ok: true, message: MEDIA_TEXT.had });
    expect(fetchMediaOutcome({ error: { status: 404 } })).toEqual({ ok: false, message: 'Deploy fetch-media to copy creatives automatically.' });
    expect(fetchMediaOutcome({ error: await readInvokeError(httpError(415, { ok: false, error: { code: 'bad_type', message: 'That is not an image or a video.' } })) })).toEqual({
      ok: false,
      message: 'The ad is saved, but the creative could not be copied: That is not an image or a video. Add the file on the ad page.',
    });
    const fetchFail = fetchMediaOutcome({ error: { name: 'FunctionsFetchError', message: 'x' } });
    expect(fetchFail.ok).toBe(false);
    expect(fetchFail.message).toContain('Deploy fetch-media');
    expect(fetchMediaOutcome({ data: null }).message).toContain('fetch-media gave no answer');
    expect(fetchMediaOutcome({ error: {} }).message).toContain('unknown error');
  });
});
