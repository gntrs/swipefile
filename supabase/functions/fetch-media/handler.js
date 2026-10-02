// fetch-media: copies a captured ad's creative from Meta's CDN into the
// caller's own storage, so the ad keeps its image or video after the CDN link
// expires. Runtime agnostic: web standard globals only, `fetch` and `env`
// passed in, so vitest runs it in Node and index.ts runs it in Deno.
//
// POST { action: 'status' }                -> { ok, hosts, maxMb }, no secret needed
// POST { action: 'fetch', adId, url }      -> { ok, path, format, bytes } | { ok, skipped: 'has_media' }
//
// It reads and writes only as the signed in caller (their token), so row
// level security and the storage policies decide what it may touch.
import { fail, json, preflight, readJson, bearer, supabaseEnv, getUser, rest, isUuid } from '../_shared/http.js';

export const DEFAULT_HOSTS = ['fbcdn.net', 'cdninstagram.com'];
export const DEFAULT_MAX_MB = 50;
export const MAX_REDIRECTS = 3;
export const TIMEOUT_MS = 20000;
export const BUCKET = 'ad-media';

// Same table as extFor in src/lib/saveAd.js.
const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

// FETCH_MEDIA_HOSTS: comma list of host suffixes. Blank means the defaults.
export function allowedHosts(env) {
  const raw = (env('FETCH_MEDIA_HOSTS') || '').trim();
  if (!raw) return [...DEFAULT_HOSTS];
  const hosts = raw
    .split(',')
    .map((h) => h.trim().toLowerCase().replace(/^\*?\.+/, '').replace(/\.+$/, ''))
    .filter(Boolean);
  return hosts.length ? [...new Set(hosts)] : [...DEFAULT_HOSTS];
}

// FETCH_MEDIA_MAX_MB, clamped to 1..50. Anything unreadable means 50.
export function maxMegabytes(env) {
  const n = Number((env('FETCH_MEDIA_MAX_MB') || '').trim());
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_MB;
  return Math.min(DEFAULT_MAX_MB, Math.max(1, Math.floor(n)));
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

// -> { ok: true, url } | { ok: false, status, code, message }
export function checkMediaUrl(raw, hosts, base) {
  let url;
  try {
    url = base ? new URL(String(raw), base) : new URL(String(raw));
  } catch {
    return { ok: false, status: 400, code: 'bad_request', message: 'The media URL is not a valid URL.' };
  }
  const refuse = (why) => ({ ok: false, status: 403, code: 'host_not_allowed', message: `${why} Allowed hosts: ${hosts.join(', ')}.` });
  if (url.protocol !== 'https:') return refuse('Only https media URLs are fetched.');
  if (url.username || url.password) return refuse('Media URLs with a user name or password are refused.');
  if (url.port && url.port !== '443') return refuse('Media URLs on a port other than 443 are refused.');
  const host = url.hostname.toLowerCase();
  if (IPV4.test(host) || host.startsWith('[') || host.includes(':')) return refuse('Media URLs on an IP address are refused.');
  if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) return refuse(`${host} is not on the allow list.`);
  return { ok: true, url };
}

function randomToken(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

const isRedirect = (status) => [301, 302, 303, 307, 308].includes(status);

async function discard(res) {
  try {
    await res.body?.cancel();
  } catch {
    /* nothing to free */
  }
}

// Follows at most MAX_REDIRECTS redirects, checking every hop against the
// allow list. -> { ok: true, res } | { ok: false, response }
async function download(url, hosts, fetchFn) {
  let current = url;
  for (let hop = 0; ; hop++) {
    let res;
    try {
      res = await fetchFn(current.href, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return {
        ok: false,
        response: fail(502, 'fetch_failed', timedOut ? 'The media host did not answer within 20 seconds.' : 'Could not reach the media host.'),
      };
    }
    if (!isRedirect(res.status)) return { ok: true, res };
    await discard(res);
    if (hop >= MAX_REDIRECTS) {
      return { ok: false, response: fail(502, 'fetch_failed', `The media URL redirected more than ${MAX_REDIRECTS} times.`) };
    }
    const location = res.headers.get('location');
    if (!location) return { ok: false, response: fail(502, 'fetch_failed', 'The media host redirected without a location.') };
    const next = checkMediaUrl(location, hosts, current);
    if (!next.ok) return { ok: false, response: fail(next.status, next.code, `Redirect refused: ${next.message}`) };
    current = next.url;
  }
}

// Reads the body counting bytes, and stops at the limit.
// -> { ok: true, bytes: Uint8Array } | { ok: false, response }
async function readLimited(res, maxBytes, maxMb) {
  const tooBig = () => fail(413, 'too_big', `The creative is over the ${maxMb} MB limit.`);
  if (!res.body) return { ok: false, response: fail(502, 'fetch_failed', 'The media host sent an empty file.') };
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* already closed */
        }
        return { ok: false, response: tooBig() };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: fail(502, 'fetch_failed', 'The download broke off.') };
  }
  if (total === 0) return { ok: false, response: fail(502, 'fetch_failed', 'The media host sent an empty file.') };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, bytes };
}

async function storageMessage(res) {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text);
    return body?.message || body?.error || text || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

async function removeObject({ fetch: fetchFn, sb, token, path }) {
  try {
    await fetchFn(`${sb.url}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'DELETE',
      headers: { apikey: sb.anonKey, Authorization: `Bearer ${token}` },
    });
  } catch {
    /* best effort: an orphaned file is better than a failed save */
  }
}

async function fetchAction(req, body, deps) {
  const { fetch: fetchFn, env } = deps;
  const hosts = allowedHosts(env);
  const maxMb = maxMegabytes(env);
  const maxBytes = maxMb * 1024 * 1024;

  const token = bearer(req);
  const who = await getUser({ fetch: fetchFn, env, token });
  if (who.response) return who.response;
  const sb = supabaseEnv(env);

  const { adId, url: rawUrl } = body;
  if (!isUuid(adId)) return fail(400, 'bad_request', 'adId must be the id of one of your ads.');
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return fail(400, 'bad_request', 'url is missing.');
  const checked = checkMediaUrl(rawUrl.trim(), hosts);
  if (!checked.ok) return fail(checked.status, checked.code, checked.message);

  const found = await rest({ fetch: fetchFn, env, token, path: `/rest/v1/ads?id=eq.${adId}&select=id,media_path` });
  if (!found.ok) return fail(502, 'upstream', 'Could not read the ad.');
  const ad = Array.isArray(found.data) ? found.data[0] : null;
  if (!ad) return fail(400, 'bad_request', 'No ad with that id, or it is not yours to change.');
  if (ad.media_path) return json(200, { ok: true, skipped: 'has_media' });

  const got = await download(checked.url, hosts, fetchFn);
  if (!got.ok) return got.response;
  const { res } = got;
  if (res.status !== 200) {
    await discard(res);
    return fail(502, 'fetch_failed', `The media host answered ${res.status}.`);
  }
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/') && !type.startsWith('video/')) {
    await discard(res);
    return fail(415, 'bad_type', `That is not an image or a video (${type || 'no content type'}).`);
  }
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discard(res);
    return fail(413, 'too_big', `The creative is over the ${maxMb} MB limit.`);
  }
  const read = await readLimited(res, maxBytes, maxMb);
  if (!read.ok) return read.response;

  const ext = MIME_EXT[type] || 'bin';
  const format = type.startsWith('video/') ? 'video' : 'image';
  const now = deps.now ? deps.now() : Date.now();
  const rand = deps.random ? deps.random() : randomToken();
  const path = `${who.user.id}/${now}-${rand}.${ext}`;

  let up;
  try {
    up = await fetchFn(`${sb.url}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: sb.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': type, 'x-upsert': 'false' },
      body: read.bytes,
    });
  } catch {
    return fail(502, 'upstream', 'Could not reach storage.');
  }
  if (!up.ok) return fail(502, 'upstream', `Storage refused the upload: ${await storageMessage(up)}`);

  const patched = await rest({
    fetch: fetchFn,
    env,
    token,
    path: `/rest/v1/ads?id=eq.${adId}&media_path=is.null`,
    method: 'PATCH',
    body: { media_path: path, format },
    prefer: 'return=representation',
  });
  if (!patched.ok) {
    await removeObject({ fetch: fetchFn, sb, token, path });
    return fail(502, 'upstream', 'Could not attach the creative to the ad.');
  }
  if (!Array.isArray(patched.data) || patched.data.length === 0) {
    // Someone added media meanwhile: keep theirs, drop ours.
    await removeObject({ fetch: fetchFn, sb, token, path });
    return json(200, { ok: true, skipped: 'has_media' });
  }
  return json(200, { ok: true, path, format, bytes: read.bytes.byteLength });
}

// deps: { fetch, env, now?, random? }
export async function handleRequest(req, deps) {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const { action } = parsed.body;
  if (action === 'status') {
    return json(200, { ok: true, hosts: allowedHosts(deps.env), maxMb: maxMegabytes(deps.env) });
  }
  if (action === 'fetch') return fetchAction(req, parsed.body, deps);
  return fail(400, 'bad_request', 'Unknown action. Use status or fetch.');
}
