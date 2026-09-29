// Shared HTTP helpers for the edge functions. Web standard globals only (no
// Deno APIs, no imports), so the handlers that use them also run under vitest
// in Node. `fetch` and `env` are always passed in: `env` is a function
// (name) => string | undefined.

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// A JSON response with the CORS headers the browser needs.
export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...headers },
  });
}

// The failure envelope every function uses: { ok: false, error: { code, message } }.
export function fail(status, code, message, extra = {}) {
  return json(status, { ok: false, error: { code, message, ...extra } });
}

// Answers the browser's CORS preflight; null for every other method.
export function preflight(req) {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
}

// Reads a JSON object body, refusing anything over maxBytes.
// -> { ok: true, body } | { ok: false, response }
export async function readJson(req, maxBytes = 65536) {
  const tooBig = () => ({
    ok: false,
    response: fail(413, 'too_big', `The request body is over ${maxBytes} bytes.`),
  });
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return tooBig();
  let text;
  try {
    text = await req.text();
  } catch {
    return { ok: false, response: fail(400, 'bad_request', 'Could not read the request body.') };
  }
  if (new TextEncoder().encode(text).length > maxBytes) return tooBig();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: fail(400, 'bad_request', 'The request body is not valid JSON.') };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, response: fail(400, 'bad_request', 'The request body must be a JSON object.') };
  }
  return { ok: true, body };
}

// The token from "Authorization: Bearer <token>", or null.
export function bearer(req) {
  const header = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

// { url, anonKey } from the runtime, or null when either is missing.
export function supabaseEnv(env) {
  const url = (env('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
  const anonKey = (env('SUPABASE_ANON_KEY') || '').trim();
  return url && anonKey ? { url, anonKey } : null;
}

const misconfigured = () =>
  fail(500, 'misconfigured', 'SUPABASE_URL or SUPABASE_ANON_KEY is missing from the function environment.');

// Who is calling. -> { user } | { response }
export async function getUser({ fetch, env, token }) {
  if (!token) return { response: fail(401, 'unauthorized', 'Sign in first: the request has no bearer token.') };
  const sb = supabaseEnv(env);
  if (!sb) return { response: misconfigured() };
  let res;
  try {
    res = await fetch(`${sb.url}/auth/v1/user`, {
      headers: { apikey: sb.anonKey, Authorization: `Bearer ${token}` },
    });
  } catch {
    return { response: fail(502, 'upstream', 'Could not reach Supabase auth.') };
  }
  if (!res.ok) return { response: fail(401, 'unauthorized', 'Your session is not valid. Sign in again.') };
  let user = null;
  try {
    user = await res.json();
  } catch {
    user = null;
  }
  if (!user || !user.id) return { response: fail(401, 'unauthorized', 'Your session is not valid. Sign in again.') };
  return { user };
}

// A call to the project's REST API as the signed in user, so Row Level
// Security applies. -> { ok, status, data, headers }, data is parsed JSON or null.
export async function rest({ fetch, env, token, path, method = 'GET', body, prefer, headers = {} }) {
  const sb = supabaseEnv(env);
  if (!sb) return { ok: false, status: 500, data: null, headers: new Headers(), error: 'misconfigured' };
  const sent = { apikey: sb.anonKey, Authorization: `Bearer ${token || sb.anonKey}` };
  if (body !== undefined) sent['Content-Type'] = 'application/json';
  if (prefer) sent.Prefer = prefer;
  let res;
  try {
    res = await fetch(`${sb.url}${path}`, {
      method,
      headers: { ...sent, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, status: 0, data: null, headers: new Headers(), error: String(err?.message || err) };
  }
  const text = await res.text().catch(() => '');
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
