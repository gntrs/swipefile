// Reads what someone pastes when they mean a Meta Ad Library ad: a bare
// library id or an Ad Library link. Builds strings only, never fetches.

export const AD_LIBRARY_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'];
export const permalinkFor = (id) => `https://www.facebook.com/ads/library/?id=${id}`;

const ID_RE = /^\d{6,20}$/;
const PATHS = ['/ads/library', '/ads/archive/render_ad'];

// A URL object for input that looks like a link on an Ad Library host and
// path, with or without the protocol. Anything else gives null.
function adLibraryUrl(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!AD_LIBRARY_HOSTS.includes(url.hostname.toLowerCase())) return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (!PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return url;
}

// -> null | { libraryId, permalink, kind: 'id' | 'url' }. The permalink is
// always rebuilt from the id, so nothing else from the input (an access
// token, tracking params) is ever kept.
export function parseAdLibraryInput(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (ID_RE.test(text)) return { libraryId: text, permalink: permalinkFor(text), kind: 'id' };
  const url = adLibraryUrl(text);
  const id = url?.searchParams.get('id');
  if (!id || !ID_RE.test(id)) return null;
  return { libraryId: id, permalink: permalinkFor(id), kind: 'url' };
}

// True for an Ad Library URL with or without an id (a search results page too).
export function isAdLibraryUrl(input) {
  return adLibraryUrl(input) !== null;
}
