import { evaluate } from './checks.js';
import { classifyKey } from '../dbConfig.js';

// Gathers what the setup check needs from a live Supabase project, then hands
// it to evaluate(). Every call has a 6 second timeout, and nothing here throws:
// a failure is an input like any other.
const TIMEOUT_MS = 6000;

function withTimeout(promise, ms = TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ data: null, error: { code: 'timeout', message: `No answer within ${ms / 1000} seconds.` } }), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  return undefined;
}

async function readSettings(config, fetchImpl) {
  try {
    const res = await fetchImpl(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.anonKey },
      signal: timeoutSignal(TIMEOUT_MS),
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, error: { message: error?.name === 'TimeoutError' ? 'No answer within 6 seconds.' : error?.message || 'Network error.' } };
  }
}

export async function runDoctor({ config, db, fetch: fetchImpl = globalThis.fetch, env = {} } = {}) {
  if (!config || config.mode !== 'live') return evaluate({ config, env });

  const settings = await readSettings(config, fetchImpl);
  let health = null;
  let adsProbe = null;
  if (!settings.error && settings.status !== 401 && settings.status !== 403) {
    try {
      health = await withTimeout(db.rpc('swipefile_health'));
    } catch (error) {
      health = { data: null, error: { message: error?.message || String(error) } };
    }
    const e = health?.error;
    if (e && (e.code === 'PGRST202' || e.code === '42883' || health?.status === 404)) {
      try {
        // A GET on purpose. supabase-js turns the empty 404 a HEAD request
        // gets for a missing table into "204 No Content" with no error, which
        // would make a database with no tables look like an old setup.
        adsProbe = await withTimeout(db.from('ads').select('id').limit(1));
      } catch (error) {
        adsProbe = { error: { message: error?.message || String(error) } };
      }
    }
  }

  let session = null;
  try {
    const { data } = await withTimeout(db.auth.getSession());
    session = data?.session?.user ? { email: data.session.user.email } : null;
  } catch {
    session = null;
  }

  return evaluate({
    config,
    env,
    settings,
    health,
    adsProbe,
    keyKind: classifyKey(config.anonKey),
    session,
  });
}
