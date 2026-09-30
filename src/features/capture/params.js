// Reads the capture URL the bookmarklet and the extension open
// (`/capture?v=1&src=...`). Every value is untrusted text from another page:
// strings are trimmed and capped, ids are digits, links and media must be
// https, dates must be real dates. Nothing here fetches or saves.

export const CAPTURE_VERSION = '1';
export const CAPTURE_SOURCES = ['bookmarklet', 'extension'];
export const CAPTURE_PLATFORMS = ['facebook', 'instagram', 'messenger', 'audience_network', 'threads', 'whatsapp'];
export const CAPTURE_KINDS = ['image', 'video'];
export const MAX_MEDIA = 4;
export const LIMITS = { brand: 200, title: 300, text: 1500, cta: 60 };

export const VERSION_WARNING =
  'This capture link comes from a different version. Update your bookmarklet from Capture setup.';

// Control characters other than tab and newline never belong in ad text.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

function cut(s, n) {
  let out = s.slice(0, n);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

// One line of text: whitespace collapsed, capped. Empty -> null.
export function cleanLine(value, max) {
  if (typeof value !== 'string') return null;
  const s = cut(value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim(), max).trim();
  return s || null;
}

// Body text keeps its line breaks. Empty -> null.
export function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const s = cut(
    value
      .replace(/\r\n?/g, '\n')
      .replace(CONTROL, ' ')
      .split('\n')
      .map((l) => l.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    max
  ).trim();
  return s || null;
}

// An https URL with no credentials, as a string. Anything else -> null.
export function httpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return url.href;
}

// 'YYYY-MM-DD' that is a real calendar date. Anything else -> null.
export function isoDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return value;
}

function toParams(input) {
  if (input instanceof URLSearchParams) return input;
  if (typeof input === 'string') return new URLSearchParams(input.startsWith('?') ? input.slice(1) : input);
  return new URLSearchParams();
}

// -> { capture, warnings }. capture uses the same field names as the parser
// in extension/parse.js, plus `src`.
export function parseCaptureParams(input) {
  const q = toParams(input);
  const warnings = [];
  if (q.get('v') !== CAPTURE_VERSION) warnings.push(VERSION_WARNING);

  const src = q.get('src');
  const id = (q.get('id') || '').trim();
  const page = (q.get('page') || '').trim();
  const active = q.get('active');
  const kind = q.get('kind');

  const platforms = [];
  for (const p of (q.get('platforms') || '').split(',')) {
    const name = p.trim().toLowerCase().replace(/ /g, '_');
    if (CAPTURE_PLATFORMS.includes(name) && !platforms.includes(name)) platforms.push(name);
  }

  const media = [];
  for (const m of q.getAll('media')) {
    const url = httpsUrl(m);
    if (url && !media.includes(url)) media.push(url);
    if (media.length >= MAX_MEDIA) break;
  }

  const capture = {
    src: CAPTURE_SOURCES.includes(src) ? src : null,
    libraryId: /^\d{6,20}$/.test(id) ? id : null,
    brand: cleanLine(q.get('brand'), LIMITS.brand),
    title: cleanLine(q.get('title'), LIMITS.title),
    text: cleanText(q.get('text'), LIMITS.text),
    cta: cleanLine(q.get('cta'), LIMITS.cta),
    link: httpsUrl(q.get('link')),
    started: isoDay(q.get('started')),
    stopped: isoDay(q.get('stopped')),
    active: active === '1' ? true : active === '0' ? false : null,
    platforms,
    pageId: /^\d{1,30}$/.test(page) ? page : null,
    kind: CAPTURE_KINDS.includes(kind) ? kind : null,
    media,
  };
  return { capture, warnings };
}

// The path half of a capture URL, in the same order and encoding as
// captureUrl in extension/parse.js (a test keeps the two in step). Used for
// the sample link on Capture setup; it does not shorten anything.
export function capturePath(capture, src = 'bookmarklet') {
  const c = capture || {};
  const pairs = [
    ['v', CAPTURE_VERSION],
    ['src', src],
    ['id', c.libraryId],
    ['brand', c.brand],
    ['title', c.title],
    ['text', c.text],
    ['cta', c.cta],
    ['link', c.link],
    ['started', c.started],
    ['stopped', c.stopped],
    ['active', c.active === true ? '1' : c.active === false ? '0' : null],
    ['platforms', Array.isArray(c.platforms) && c.platforms.length ? c.platforms.join(',') : null],
    ['page', c.pageId],
    ['kind', c.kind],
    ...(Array.isArray(c.media) ? c.media : []).map((m) => ['media', m]),
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
  return '/capture?' + pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}
