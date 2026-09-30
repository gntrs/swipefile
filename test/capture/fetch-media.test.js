import { describe, it, expect } from 'vitest';
import {
  handleRequest, checkMediaUrl, allowedHosts, maxMegabytes, DEFAULT_HOSTS,
} from '../../supabase/functions/fetch-media/handler.js';

const SB = 'https://proj.example.co';
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.example' };
const AD = '22222222-2222-4222-8222-222222222222';
const MEDIA = 'https://scontent.xx.fbcdn.net/v/t45/ad.jpg?oh=abc';
const BASE_ENV = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon' };

// A stub for everything the function talks to: Supabase auth, REST and
// storage, and the media host. Records every call.
function world({
  env = {},
  ad = { id: AD, media_path: null },
  media = () => new Response(new Uint8Array(1000), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
  upload = () => new Response('{"Key":"ok"}', { status: 200 }),
  patchRows = null,
  patchStatus = 200,
  user = USER,
} = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u === `${SB}/auth/v1/user`) {
      return user ? new Response(JSON.stringify(user), { status: 200 }) : new Response('{}', { status: 401 });
    }
    if (u.startsWith(`${SB}/rest/v1/ads`)) {
      if ((init.method || 'GET') === 'GET') return new Response(JSON.stringify(ad ? [ad] : []), { status: 200 });
      if (patchStatus !== 200) return new Response('{"message":"boom"}', { status: patchStatus });
      const body = JSON.parse(init.body);
      return new Response(JSON.stringify(patchRows ?? [{ id: AD, ...body }]), { status: 200 });
    }
    if (u.startsWith(`${SB}/storage/v1/object/`)) {
      if (init.method === 'DELETE') return new Response('{}', { status: 200 });
      return upload(u, init);
    }
    return media(u, init);
  };
  const deps = { fetch, env: (n) => ({ ...BASE_ENV, ...env })[n], now: () => 1700000000000, random: () => 'abcd1234' };
  const call = (body, { token = 'user-token', method = 'POST' } = {}) =>
    handleRequest(
      new Request('https://fn.example/fetch-media', {
        method,
        headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : {},
        body: method === 'POST' ? JSON.stringify(body) : undefined,
      }),
      deps
    );
  const fetchCall = (url = MEDIA, extra = {}) => call({ action: 'fetch', adId: AD, url, ...extra });
  const mediaCalls = () => calls.filter((c) => !c.url.startsWith(SB));
  return { calls, call, fetchCall, mediaCalls };
}

const body = async (res) => ({ status: res.status, ...(await res.json()) });
const redirect = (location, status = 302) => new Response(null, { status, headers: location ? { location } : {} });

describe('status', () => {
  it('needs no secret and no sign in', async () => {
    const w = world({ env: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' } });
    expect(await body(await w.call({ action: 'status' }, { token: null }))).toEqual({
      status: 200, ok: true, hosts: DEFAULT_HOSTS, maxMb: 50,
    });
    expect(w.calls).toEqual([]);
  });
  it('reports the configured hosts and limit', async () => {
    const w = world({ env: { FETCH_MEDIA_HOSTS: ' fbcdn.net, *.example-cdn.test ,', FETCH_MEDIA_MAX_MB: '10' } });
    expect(await body(await w.call({ action: 'status' }))).toMatchObject({ hosts: ['fbcdn.net', 'example-cdn.test'], maxMb: 10 });
  });
});

describe('env parsing', () => {
  const env = (vars) => (n) => vars[n];
  it('allowedHosts falls back to the defaults', () => {
    expect(allowedHosts(env({}))).toEqual(DEFAULT_HOSTS);
    expect(allowedHosts(env({ FETCH_MEDIA_HOSTS: ' , ' }))).toEqual(DEFAULT_HOSTS);
    expect(allowedHosts(env({ FETCH_MEDIA_HOSTS: 'A.Example.,a.example' }))).toEqual(['a.example']);
  });
  it.each([
    [undefined, 50], ['', 50], ['abc', 50], ['0', 50], ['-5', 50], ['0.5', 1], ['1', 1], ['25', 25], ['50', 50], ['500', 50],
  ])('FETCH_MEDIA_MAX_MB %s -> %s', (raw, mb) => {
    expect(maxMegabytes(env({ FETCH_MEDIA_MAX_MB: raw }))).toBe(mb);
  });
});

describe('the envelope', () => {
  it('OPTIONS gets the CORS preflight, GET is refused', async () => {
    const w = world();
    expect((await w.call(null, { method: 'OPTIONS' })).status).toBe(204);
    expect(await body(await w.call(null, { method: 'GET' }))).toMatchObject({ status: 405, error: { code: 'method_not_allowed' } });
  });
  it('unknown action and bad JSON are 400', async () => {
    const w = world();
    expect(await body(await w.call({ action: 'steal' }))).toMatchObject({ status: 400, error: { code: 'bad_request' } });
    const res = await handleRequest(new Request('https://fn.example', { method: 'POST', body: '{nope' }), {
      fetch: () => {
        throw new Error('no');
      },
      env: () => undefined,
    });
    expect(res.status).toBe(400);
  });
  it('fetch without a token is 401 and fetches nothing', async () => {
    const w = world();
    expect(await body(await w.call({ action: 'fetch', adId: AD, url: MEDIA }, { token: null }))).toMatchObject({
      status: 401, error: { code: 'unauthorized' },
    });
    expect(w.calls).toEqual([]);
  });
  it('an invalid session is 401', async () => {
    const w = world({ user: null });
    expect(await body(await w.fetchCall())).toMatchObject({ status: 401, error: { code: 'unauthorized' } });
    expect(w.mediaCalls()).toEqual([]);
  });
  it('missing Supabase env is 500 misconfigured', async () => {
    const w = world({ env: { SUPABASE_URL: '' } });
    expect(await body(await w.fetchCall())).toMatchObject({ status: 500, error: { code: 'misconfigured' } });
  });
  it('adId must be a uuid, url must be there', async () => {
    const w = world();
    expect(await body(await w.fetchCall(MEDIA, { adId: '1 or 1=1' }))).toMatchObject({ status: 400, error: { code: 'bad_request' } });
    expect(await body(await w.fetchCall(''))).toMatchObject({ status: 400 });
    expect(await body(await w.fetchCall(42))).toMatchObject({ status: 400 });
    expect(w.mediaCalls()).toEqual([]);
  });
});

describe('the allow list', () => {
  it.each([
    'https://scontent.xx.fbcdn.net/a.jpg',
    'https://fbcdn.net/a.jpg',
    'https://scontent.cdninstagram.com/a.mp4',
    'https://video.xx.fbcdn.net:443/a.mp4',
  ])('allows %s', (url) => {
    expect(checkMediaUrl(url, DEFAULT_HOSTS).ok).toBe(true);
  });

  it.each([
    ['https://evilfbcdn.net/a.jpg', 403],
    ['https://fbcdn.net.evil.test/a.jpg', 403],
    ['http://scontent.xx.fbcdn.net/a.jpg', 403],
    ['https://user:pass@scontent.xx.fbcdn.net/a.jpg', 403],
    ['https://user@scontent.xx.fbcdn.net/a.jpg', 403],
    ['https://scontent.xx.fbcdn.net:8443/a.jpg', 403],
    ['https://127.0.0.1/a.jpg', 403],
    ['https://2130706433/a.jpg', 403],
    ['https://[::1]/a.jpg', 403],
    ['https://[::ffff:7f00:1]/a.jpg', 403],
    ['file:///etc/passwd', 403],
    ['javascript:alert(1)', 403],
    ['not a url', 400],
  ])('refuses %s with %s and never fetches it', async (url, status) => {
    const w = world();
    const res = await body(await w.fetchCall(url));
    expect(res.status).toBe(status);
    expect(res.error.code).toBe(status === 403 ? 'host_not_allowed' : 'bad_request');
    expect(w.mediaCalls()).toEqual([]);
    expect(w.calls.some((c) => c.url.includes('/storage/'))).toBe(false);
  });
});

describe('redirects', () => {
  it('follows up to 3 redirects on allowed hosts, relative ones too', async () => {
    const hops = [redirect('https://a.fbcdn.net/2.jpg'), redirect('/3.jpg', 301), redirect('https://c.cdninstagram.com/4.jpg', 307)];
    const w = world({
      media: () => hops.shift() || new Response(new Uint8Array(10), { status: 200, headers: { 'content-type': 'image/png' } }),
    });
    const res = await body(await w.fetchCall());
    expect(res).toMatchObject({ status: 200, ok: true, format: 'image', bytes: 10 });
    expect(w.mediaCalls().map((c) => c.url)).toEqual([MEDIA, 'https://a.fbcdn.net/2.jpg', 'https://a.fbcdn.net/3.jpg', 'https://c.cdninstagram.com/4.jpg']);
    for (const c of w.mediaCalls()) {
      expect(c.init.redirect).toBe('manual');
      expect(c.init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('refuses a fourth redirect', async () => {
    const w = world({ media: (u) => redirect(`https://a.fbcdn.net/${u.length}.jpg`) });
    const res = await body(await w.fetchCall());
    expect(res).toMatchObject({ status: 502, error: { code: 'fetch_failed' } });
    expect(w.mediaCalls()).toHaveLength(4);
  });

  it('refuses a redirect to another host, or to plain http, or to an IP', async () => {
    for (const to of ['https://evil.example/x.jpg', 'http://a.fbcdn.net/x.jpg', 'https://169.254.169.254/latest']) {
      const w = world({ media: (u) => (u === MEDIA ? redirect(to) : new Response('secret', { status: 200 })) });
      const res = await body(await w.fetchCall());
      expect(res).toMatchObject({ status: 403, error: { code: 'host_not_allowed' } });
      expect(w.mediaCalls()).toHaveLength(1);
    }
  });

  it('a redirect with no location fails', async () => {
    const w = world({ media: () => redirect(null) });
    expect(await body(await w.fetchCall())).toMatchObject({ status: 502, error: { code: 'fetch_failed' } });
  });
});

describe('the download', () => {
  it('a non 200 answer is 502 fetch_failed', async () => {
    for (const status of [403, 404, 500, 204]) {
      const w = world({ media: () => new Response(status === 204 ? null : 'x', { status, headers: { 'content-type': 'image/jpeg' } }) });
      expect(await body(await w.fetchCall())).toMatchObject({ status: 502, error: { code: 'fetch_failed' } });
    }
  });

  it('a network failure or timeout is 502 fetch_failed', async () => {
    const w = world({
      media: () => {
        throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      },
    });
    const res = await body(await w.fetchCall());
    expect(res).toMatchObject({ status: 502, error: { code: 'fetch_failed' } });
    expect(res.error.message).toContain('20 seconds');
  });

  it('text/html is 415 bad_type, and so is no content type', async () => {
    for (const type of ['text/html; charset=utf-8', '']) {
      const w = world({ media: () => new Response('<html>', { status: 200, headers: type ? { 'content-type': type } : {} }) });
      expect(await body(await w.fetchCall())).toMatchObject({ status: 415, error: { code: 'bad_type' } });
      expect(w.calls.some((c) => c.url.includes('/storage/'))).toBe(false);
    }
  });

  it('a content-length over the limit is 413 before reading', async () => {
    const w = world({
      env: { FETCH_MEDIA_MAX_MB: '1' },
      media: () => new Response('x', { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(1024 * 1024 + 1) } }),
    });
    expect(await body(await w.fetchCall())).toMatchObject({ status: 413, error: { code: 'too_big' } });
  });

  it('a streamed body over the limit is 413 and the stream is cancelled', async () => {
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(256 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const w = world({ env: { FETCH_MEDIA_MAX_MB: '1' }, media: () => new Response(stream, { status: 200, headers: { 'content-type': 'video/mp4' } }) });
    expect(await body(await w.fetchCall())).toMatchObject({ status: 413, error: { code: 'too_big' } });
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
    expect(w.calls.some((c) => c.url.includes('/storage/'))).toBe(false);
  });

  it('exactly the limit is fine', async () => {
    const w = world({
      env: { FETCH_MEDIA_MAX_MB: '1' },
      media: () => new Response(new Uint8Array(1024 * 1024), { status: 200, headers: { 'content-type': 'image/webp' } }),
    });
    expect(await body(await w.fetchCall())).toMatchObject({ status: 200, bytes: 1024 * 1024 });
  });

  it('an empty body is 502', async () => {
    const w = world({ media: () => new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'image/jpeg' } }) });
    expect(await body(await w.fetchCall())).toMatchObject({ status: 502, error: { code: 'fetch_failed' } });
  });
});

describe('the ad', () => {
  it('reads the ad with the caller token', async () => {
    const w = world();
    await w.fetchCall();
    const read = w.calls.find((c) => c.url.startsWith(`${SB}/rest/v1/ads`) && !c.init.method?.startsWith('P'));
    expect(read.url).toBe(`${SB}/rest/v1/ads?id=eq.${AD}&select=id,media_path`);
    expect(read.init.headers.Authorization).toBe('Bearer user-token');
  });
  it('a missing ad is 400, and nothing is fetched', async () => {
    const w = world({ ad: null });
    expect(await body(await w.fetchCall())).toMatchObject({ status: 400, error: { code: 'bad_request' } });
    expect(w.mediaCalls()).toEqual([]);
  });
  it('an ad that already has media is skipped', async () => {
    const w = world({ ad: { id: AD, media_path: 'u/old.jpg' } });
    expect(await body(await w.fetchCall())).toEqual({ status: 200, ok: true, skipped: 'has_media' });
    expect(w.mediaCalls()).toEqual([]);
  });
});

describe('upload and attach', () => {
  it('uploads to the caller folder with the caller token and x-upsert false', async () => {
    const w = world({ media: () => new Response(new Uint8Array(42), { status: 200, headers: { 'content-type': 'video/quicktime' } }) });
    const res = await body(await w.fetchCall());
    const path = `${USER.id}/1700000000000-abcd1234.mov`;
    expect(res).toEqual({ status: 200, ok: true, path, format: 'video', bytes: 42 });
    const up = w.calls.find((c) => c.init.method === 'POST' && c.url.includes('/storage/'));
    expect(up.url).toBe(`${SB}/storage/v1/object/ad-media/${path}`);
    expect(up.init.headers).toEqual({ apikey: 'anon', Authorization: 'Bearer user-token', 'Content-Type': 'video/quicktime', 'x-upsert': 'false' });
    expect(up.init.body.byteLength).toBe(42);
  });

  it('an unknown image type gets .bin, jpeg gets .jpg', async () => {
    const w = world({ media: () => new Response(new Uint8Array(5), { status: 200, headers: { 'content-type': 'image/x-weird' } }) });
    expect((await body(await w.fetchCall())).path.endsWith('.bin')).toBe(true);
    const w2 = world();
    expect((await body(await w2.fetchCall())).path.endsWith('.jpg')).toBe(true);
  });

  it('the PATCH only fills an empty media_path, as the caller', async () => {
    const w = world();
    await w.fetchCall();
    const patch = w.calls.find((c) => c.init.method === 'PATCH');
    expect(patch.url).toBe(`${SB}/rest/v1/ads?id=eq.${AD}&media_path=is.null`);
    expect(patch.init.headers.Prefer).toBe('return=representation');
    expect(patch.init.headers.Authorization).toBe('Bearer user-token');
    expect(JSON.parse(patch.init.body)).toEqual({ media_path: `${USER.id}/1700000000000-abcd1234.jpg`, format: 'image' });
  });

  it('zero rows patched deletes the upload and reports has_media', async () => {
    const w = world({ patchRows: [] });
    expect(await body(await w.fetchCall())).toEqual({ status: 200, ok: true, skipped: 'has_media' });
    const del = w.calls.find((c) => c.init.method === 'DELETE');
    expect(del.url).toBe(`${SB}/storage/v1/object/ad-media/${USER.id}/1700000000000-abcd1234.jpg`);
    expect(del.init.headers.Authorization).toBe('Bearer user-token');
  });

  it('a storage refusal is 502 upstream with the storage message, and no PATCH', async () => {
    const w = world({ upload: () => new Response(JSON.stringify({ message: 'new row violates row-level security policy' }), { status: 403 }) });
    const res = await body(await w.fetchCall());
    expect(res).toMatchObject({ status: 502, error: { code: 'upstream' } });
    expect(res.error.message).toContain('row-level security');
    expect(w.calls.some((c) => c.init.method === 'PATCH')).toBe(false);
  });

  it('a failed PATCH removes the upload', async () => {
    const w = world({ patchStatus: 500, media: () => new Response(new Uint8Array(3), { status: 200, headers: { 'content-type': 'image/gif' } }) });
    expect(await body(await w.fetchCall())).toMatchObject({ status: 502, error: { code: 'upstream' } });
    const del = w.calls.find((c) => c.init.method === 'DELETE');
    expect(del.url).toBe(`${SB}/storage/v1/object/ad-media/${USER.id}/1700000000000-abcd1234.gif`);
  });
});
