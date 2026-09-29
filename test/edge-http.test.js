import { describe, it, expect, vi } from 'vitest';
import {
  CORS_HEADERS, json, fail, preflight, readJson, bearer, supabaseEnv, getUser, rest, isUuid,
} from '../supabase/functions/_shared/http.js';

const ENV = { SUPABASE_URL: 'https://proj.example.co/', SUPABASE_ANON_KEY: 'anon-key' };
const env = (vars = ENV) => (name) => vars[name];
const post = (body, headers = {}) => new Request('https://fn.example/ai', { method: 'POST', body, headers });
const reply = (status, body) =>
  new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('json and fail', () => {
  it('json sets status, CORS and content type', async () => {
    const res = json(200, { ok: true }, { 'X-Extra': '1' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('x-extra')).toBe('1');
    expect(await res.json()).toEqual({ ok: true });
  });
  it('fail wraps the error envelope with extras', async () => {
    const res = fail(422, 'refused', 'The model declined.', { category: 'policy' });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'refused', message: 'The model declined.', category: 'policy' } });
  });
});

describe('preflight', () => {
  it('answers OPTIONS with 204 and the CORS headers', () => {
    const res = preflight(new Request('https://fn.example/ai', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    for (const [k, v] of Object.entries(CORS_HEADERS)) expect(res.headers.get(k)).toBe(v);
  });
  it('is null for anything else', () => {
    expect(preflight(post('{}'))).toBeNull();
    expect(preflight(new Request('https://fn.example/ai'))).toBeNull();
  });
});

describe('readJson', () => {
  it('reads a JSON object', async () => {
    expect(await readJson(post('{"action":"status"}'))).toEqual({ ok: true, body: { action: 'status' } });
  });
  it('refuses bad JSON with 400', async () => {
    const r = await readJson(post('{nope'));
    expect(r.ok).toBe(false);
    expect(r.response.status).toBe(400);
    expect((await r.response.json()).error.code).toBe('bad_request');
  });
  it('refuses a body that is not an object', async () => {
    for (const body of ['[]', '42', 'null', '"text"', '']) {
      const r = await readJson(post(body));
      expect(r.ok).toBe(false);
      expect(r.response.status).toBe(400);
    }
  });
  it('refuses an oversize body with 413, by header or by length', async () => {
    const big = JSON.stringify({ text: 'x'.repeat(200) });
    const r = await readJson(post(big), 100);
    expect(r.response.status).toBe(413);
    expect((await r.response.json()).error.code).toBe('too_big');
    const declared = await readJson(post('{}', { 'content-length': '999999' }), 100);
    expect(declared.response.status).toBe(413);
  });
  it('counts bytes, not characters', async () => {
    const r = await readJson(post(JSON.stringify({ t: 'é'.repeat(40) })), 60);
    expect(r.response.status).toBe(413);
  });
});

describe('bearer', () => {
  it('reads the token', () => {
    expect(bearer(post('{}', { Authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi');
    expect(bearer(post('{}', { authorization: 'bearer tok' }))).toBe('tok');
  });
  it('is null without one', () => {
    expect(bearer(post('{}'))).toBeNull();
    expect(bearer(post('{}', { Authorization: 'Basic abc' }))).toBeNull();
    expect(bearer(post('{}', { Authorization: 'Bearer ' }))).toBeNull();
  });
});

describe('supabaseEnv', () => {
  it('trims the trailing slash', () => {
    expect(supabaseEnv(env())).toEqual({ url: 'https://proj.example.co', anonKey: 'anon-key' });
  });
  it('is null when either value is missing', () => {
    expect(supabaseEnv(env({ SUPABASE_URL: 'https://x' }))).toBeNull();
    expect(supabaseEnv(env({ SUPABASE_ANON_KEY: 'k' }))).toBeNull();
    expect(supabaseEnv(env({}))).toBeNull();
  });
});

describe('getUser', () => {
  it('asks auth with apikey and bearer and returns the user', async () => {
    const fetch = vi.fn(async () => reply(200, { id: 'u1', email: 'a@example.com' }));
    const r = await getUser({ fetch, env: env(), token: 'tok' });
    expect(r).toEqual({ user: { id: 'u1', email: 'a@example.com' } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://proj.example.co/auth/v1/user');
    expect(init.headers).toEqual({ apikey: 'anon-key', Authorization: 'Bearer tok' });
  });
  it('401 without a token, and no fetch', async () => {
    const fetch = vi.fn();
    const r = await getUser({ fetch, env: env(), token: null });
    expect(r.response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('401 when auth rejects the token or returns no user', async () => {
    let r = await getUser({ fetch: async () => reply(401, { msg: 'bad jwt' }), env: env(), token: 'tok' });
    expect(r.response.status).toBe(401);
    expect((await r.response.json()).error.code).toBe('unauthorized');
    r = await getUser({ fetch: async () => reply(200, {}), env: env(), token: 'tok' });
    expect(r.response.status).toBe(401);
    r = await getUser({ fetch: async () => reply(200, 'not json'), env: env(), token: 'tok' });
    expect(r.response.status).toBe(401);
  });
  it('500 misconfigured when the runtime env is missing', async () => {
    const r = await getUser({ fetch: vi.fn(), env: env({}), token: 'tok' });
    expect(r.response.status).toBe(500);
    expect((await r.response.json()).error.code).toBe('misconfigured');
  });
  it('502 upstream when auth cannot be reached', async () => {
    const r = await getUser({ fetch: async () => { throw new Error('down'); }, env: env(), token: 'tok' });
    expect(r.response.status).toBe(502);
  });
});

describe('rest', () => {
  it('builds the URL, sends apikey, bearer, JSON and Prefer, parses the reply', async () => {
    const fetch = vi.fn(async () => reply(201, [{ id: 1 }]));
    const r = await rest({ fetch, env: env(), token: 'tok', path: '/rest/v1/ads?id=eq.1', method: 'PATCH', body: { a: 1 }, prefer: 'return=representation' });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(201);
    expect(r.data).toEqual([{ id: 1 }]);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://proj.example.co/rest/v1/ads?id=eq.1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({
      apikey: 'anon-key', Authorization: 'Bearer tok', 'Content-Type': 'application/json', Prefer: 'return=representation',
    });
  });
  it('GET sends no body and no content type', async () => {
    const fetch = vi.fn(async () => reply(200, []));
    await rest({ fetch, env: env(), token: 'tok', path: '/rest/v1/ads' });
    const [, init] = fetch.mock.calls[0];
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
  });
  it('reports a failing status with its parsed body', async () => {
    const r = await rest({ fetch: async () => reply(403, { message: 'denied' }), env: env(), token: 'tok', path: '/rest/v1/ads' });
    expect(r).toMatchObject({ ok: false, status: 403, data: { message: 'denied' } });
  });
  it('data is null for an empty or non JSON reply', async () => {
    let r = await rest({ fetch: async () => reply(204), env: env(), token: 'tok', path: '/x' });
    expect(r).toMatchObject({ ok: true, status: 204, data: null });
    r = await rest({ fetch: async () => reply(200, 'plain'), env: env(), token: 'tok', path: '/x' });
    expect(r.data).toBeNull();
  });
  it('does not throw when the network fails or env is missing', async () => {
    let r = await rest({ fetch: async () => { throw new Error('down'); }, env: env(), token: 'tok', path: '/x' });
    expect(r).toMatchObject({ ok: false, status: 0, data: null });
    r = await rest({ fetch: vi.fn(), env: env({}), token: 'tok', path: '/x' });
    expect(r).toMatchObject({ ok: false, status: 500 });
  });
});

describe('isUuid', () => {
  it('accepts uuids in any case and refuses the rest', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('ABCDEF00-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('00000000-0000-4000-8000-00000000000')).toBe(false);
    expect(isUuid('x0000000-0000-4000-8000-000000000001')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(' 00000000-0000-4000-8000-000000000001')).toBe(false);
  });
});
