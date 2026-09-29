// Reads the database settings from the environment and decides which mode the
// app runs in. Pure: no imports, no side effects, so tests and Node scripts can
// call it directly.
//
//   live           a Supabase URL and a public key are set and look right
//   demo           nothing is set (a fresh clone), or VITE_DEMO=1
//   misconfigured  something is set but wrong; the setup check explains what

function decodeBase64Url(part) {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  if (typeof atob === 'function') return atob(padded);
  return Buffer.from(padded, 'base64').toString('binary');
}

// Which kind of Supabase key this is. The browser must only ever hold the anon
// (legacy JWT) or publishable key. Never throws.
export function classifyKey(key) {
  try {
    const k = String(key || '').trim();
    if (!k) return 'unknown';
    if (k.startsWith('sb_publishable_')) return 'publishable';
    if (k.startsWith('sb_secret_')) return 'secret';
    const parts = k.split('.');
    if (parts.length !== 3) return 'unknown';
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    if (payload?.role === 'anon') return 'anon';
    if (payload?.role === 'service_role') return 'service';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function readDbConfig(env = {}) {
  const e = env || {};
  const url = (e.VITE_DB_URL || e.VITE_SUPABASE_URL || '').trim();
  const anonKey = (e.VITE_DB_ANON_KEY || e.VITE_SUPABASE_ANON_KEY || '').trim();
  const base = { url: url || null, anonKey: anonKey || null };

  if (e.VITE_DEMO === '1') return { mode: 'demo', ...base, reason: null, missing: [] };
  if (!url && !anonKey) return { mode: 'demo', ...base, reason: null, missing: [] };

  if (!url || !anonKey) {
    return {
      mode: 'misconfigured',
      ...base,
      reason: 'missing_env',
      missing: [!url ? 'VITE_DB_URL' : 'VITE_DB_ANON_KEY'],
    };
  }
  if (!isHttpUrl(url)) return { mode: 'misconfigured', ...base, reason: 'bad_url', missing: [] };

  const kind = classifyKey(anonKey);
  if (kind === 'service' || kind === 'secret') {
    return { mode: 'misconfigured', ...base, reason: 'service_key', missing: [] };
  }

  return { mode: 'live', url: url.replace(/\/+$/, ''), anonKey, reason: null, missing: [] };
}
