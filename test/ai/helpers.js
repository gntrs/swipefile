// Stubs for the ai edge function tests: a fake Supabase (auth, REST, storage
// signing) behind a stub fetch, and a fake Anthropic client with canned answers.
import { vi } from 'vitest';

export const SB_URL = 'https://proj.example.co';
export const BASE_ENV = { SUPABASE_URL: SB_URL, SUPABASE_ANON_KEY: 'anon-key', ANTHROPIC_API_KEY: 'test-key' };
export const USER = { id: '00000000-0000-4000-8000-00000000aaaa', email: 'you@example.com' };
export const AD_ID = '00000000-0000-4000-8000-000000000001';
export const AD_ID_2 = '00000000-0000-4000-8000-000000000002';
export const AD_ID_3 = '00000000-0000-4000-8000-000000000003';
export const NOW = new Date('2026-09-29T10:00:00.000Z');

export const envOf = (vars) => (name) => vars[name];

export function jsonResponse(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

// routes: [{ match: (url, init) => boolean, reply: (url, init) => Response }]
// Every call is recorded with its parsed body. Auth answers USER unless
// `auth` is given.
export function stubFetch(routes = [], { auth } = {}) {
  const calls = [];
  const fn = vi.fn(async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    let body;
    try {
      body = init.body ? JSON.parse(init.body) : undefined;
    } catch {
      body = init.body;
    }
    const call = { url, method, body, headers: init.headers || {} };
    calls.push(call);
    if (url === `${SB_URL}/auth/v1/user`) return auth ? auth(call) : jsonResponse(200, USER);
    for (const r of routes) {
      if (r.match(call)) return r.reply(call);
    }
    return jsonResponse(404, { message: `no stub for ${method} ${url}` });
  });
  fn.calls = calls;
  return fn;
}

// A text message whose first text block is `data` as JSON.
export const message = (data, extra = {}) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }],
  ...extra,
});

// answers: array of message objects, or { throw: { status, message } } entries.
export function stubClient(answers = []) {
  const create = vi.fn(async () => {
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next && next.throw) throw Object.assign(new Error(next.throw.message || 'error'), next.throw);
    return next;
  });
  const client = { messages: { create } };
  const makeClient = vi.fn(() => client);
  return { client, create, makeClient };
}

export const post = (body, { token = 'user-token', raw } = {}) =>
  new Request('https://fn.example/ai', {
    method: 'POST',
    body: raw !== undefined ? raw : JSON.stringify(body),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

export const GOOD_ANALYSIS = {
  hook: 'A customer quote',
  angle: 'social_proof',
  format: 'UGC video',
  audience: 'Busy people',
  why_it_works: 'It opens with a line people say.',
  weaknesses: 'The offer is late.',
  remix_ideas: ['Lead with the count', 'Cut faster'],
};

export function adRow(over = {}) {
  return {
    id: AD_ID,
    brand: 'Driftwood Oats',
    hook: 'I stopped skipping breakfast',
    ad_copy: 'Real oats. Ready in two minutes.',
    landing_url: 'https://example.com/oats',
    format: 'image',
    platform: 'Facebook',
    media_path: `${USER.id}/1700000000000-abcd1234.jpg`,
    verdict: 'winner',
    tags: ['ugc'],
    metrics: { starred: true, days_running: 40, live: true },
    ...over,
  };
}
