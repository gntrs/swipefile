// The app's side of the ai edge function. None of these throw: every result
// carries `ok`, and a failure carries a `code` and a `message` fit to show.
//
// AI runs in the user's own Supabase project (supabase/functions/ai) with
// their own Anthropic key. In demo mode nothing leaves the browser: every call
// answers `demo`. Everything is built by createAi so tests can inject the
// client, the clock and the background switch.
import { db, IS_DEMO } from './db.js';

export const AI_FIX_TEXT = {
  no_key: 'Add ANTHROPIC_API_KEY to your edge function: supabase secrets set ANTHROPIC_API_KEY=your-key',
  bad_key: 'Anthropic rejected ANTHROPIC_API_KEY. Set a valid key: supabase secrets set ANTHROPIC_API_KEY=your-key',
  not_deployed: 'Deploy the ai edge function: supabase functions deploy ai',
  demo: 'AI runs in your own Supabase project. Connect one and deploy the ai function to use it.',
  signed_out: 'Sign in to use AI.',
  not_built: 'AI is not part of this build yet.',
};

// The command that fixes a state, for a copy button next to the message.
export const AI_FIX_COMMAND = {
  no_key: 'supabase secrets set ANTHROPIC_API_KEY=your-key',
  bad_key: 'supabase secrets set ANTHROPIC_API_KEY=your-key',
  not_deployed: 'supabase functions deploy ai',
};

export const NETWORK_TEXT = 'Could not reach your Supabase project.';
export const STATUS_TTL_MS = 5 * 60 * 1000;
// Background tagging after saves: at most this many ads per save event, and
// per page load in total (E12).
export const BACKGROUND_PER_CALL = 20;
export const BACKGROUND_PER_LOAD = 100;

const STATES = ['ready', 'no_key', 'bad_key', 'not_deployed', 'demo', 'signed_out', 'network', 'error', 'not_built'];
// States worth remembering for five minutes. A signed out or unreachable
// answer is asked again next time.
const CACHEABLE = new Set(['ready', 'no_key', 'bad_key', 'not_deployed']);
// A failed action with one of these codes means the cached status is stale.
const STATUS_CODES = new Set(['no_key', 'bad_key', 'not_deployed', 'signed_out']);

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

const failure = (code, message, extra = {}) => ({ ok: false, code, message: message || AI_FIX_TEXT[code] || 'Something went wrong.', ...extra });

// Turns an error from client.functions.invoke into { ok: false, code, message }.
export async function mapInvokeError(error) {
  const name = error?.name || '';
  if (name === 'FunctionsHttpError') {
    const ctx = error.context;
    const status = Number(ctx?.status) || 0;
    let body = null;
    try {
      body = typeof ctx?.json === 'function' ? await ctx.json() : null;
    } catch {
      body = null;
    }
    const envelope = body && body.ok === false && body.error && typeof body.error.code === 'string' ? body.error : null;
    if (envelope) {
      const { code, message, ...extra } = envelope;
      if (code === 'unauthorized') return failure('signed_out');
      return failure(code, AI_FIX_TEXT[code] || message, extra);
    }
    if (status === 404) return failure('not_deployed');
    if (status === 401) return failure('signed_out');
    return failure('error', `The ai function answered ${status || 'with an error'}. Check its logs in Supabase.`);
  }
  if (name === 'FunctionsFetchError') return failure('network', NETWORK_TEXT);
  if (error?.code === 'demo') return failure('demo');
  return failure('error', error?.message || 'The ai function failed.');
}

export function createAi({
  client,
  isDemo,
  now = () => Date.now(),
  auto = env.VITE_AI_AUTO,
  debug = (...args) => console.debug(...args),
} = {}) {
  let cached = null; // { at, value }
  let inflight = null;
  let backgroundUsed = 0;

  async function signedIn() {
    try {
      const { data } = await client.auth.getSession();
      return Boolean(data?.session);
    } catch {
      return false;
    }
  }

  // -> { ok: true, data } | failure
  async function call(action, args = {}) {
    if (isDemo) return failure('demo');
    if (!(await signedIn())) return failure('signed_out');
    let res;
    try {
      res = await client.functions.invoke('ai', { body: { action, ...args } });
    } catch (err) {
      return failure('network', NETWORK_TEXT);
    }
    const { data, error } = res || {};
    let out;
    if (error) out = await mapInvokeError(error);
    else if (data && data.ok === true) out = { ok: true, data };
    else if (data?.error?.code) out = failure(data.error.code, AI_FIX_TEXT[data.error.code] || data.error.message);
    else out = failure('error', 'The ai function sent an answer this app does not understand.');
    if (!out.ok && STATUS_CODES.has(out.code)) cached = null;
    return out;
  }

  // -> { ok, state, message, model?, batchLimit? }
  async function aiStatus({ force = false } = {}) {
    if (isDemo) return { ok: false, state: 'demo', message: AI_FIX_TEXT.demo };
    if (!force && cached && now() - cached.at < STATUS_TTL_MS) return cached.value;
    if (!force && inflight) return inflight;
    const run = (async () => {
      const r = await call('status');
      let value;
      if (r.ok) {
        const { model, batchLimit } = r.data;
        value = r.data.ready
          ? { ok: true, state: 'ready', message: `AI ready: ${model}, up to ${batchLimit} ads per tagging run`, model, batchLimit }
          : { ok: false, state: 'no_key', message: AI_FIX_TEXT.no_key, model, batchLimit };
      } else {
        const state = STATES.includes(r.code) ? r.code : 'error';
        value = { ok: false, state, message: r.message };
      }
      cached = CACHEABLE.has(value.state) ? { at: now(), value } : null;
      return value;
    })();
    inflight = run;
    try {
      return await run;
    } finally {
      if (inflight === run) inflight = null;
    }
  }

  // The cached status without asking, or null.
  function cachedStatus() {
    if (!cached || now() - cached.at >= STATUS_TTL_MS) return null;
    return cached.value;
  }

  async function analyzeAd(adId) {
    const r = await call('analyze', { adId });
    return r.ok ? { ok: true, analysis: r.data.analysis, ad: r.data.ad } : r;
  }

  async function classifyAds({ adIds, limit } = {}) {
    const args = {};
    if (Array.isArray(adIds)) args.adIds = adIds;
    if (limit !== undefined) args.limit = limit;
    const r = await call('classify', args);
    if (!r.ok) return r;
    const { classified, remaining, capped, limit: used } = r.data;
    return { ok: true, classified, remaining, capped, limit: used };
  }

  async function buildBrief({ adIds = [], hooks = [], title, notes } = {}) {
    const args = { adIds, hooks };
    if (title !== undefined) args.title = title;
    if (notes !== undefined) args.notes = notes;
    const r = await call('brief', args);
    return r.ok ? { ok: true, brief: r.data.brief } : r;
  }

  async function countUnclassified() {
    if (isDemo) return failure('demo');
    try {
      const { count, error } = await client
        .from('ads')
        .select('id', { count: 'exact', head: true })
        .is('metrics->>angle', null);
      if (error) return failure('error', error.message || 'Could not count the untagged ads.');
      return { ok: true, count: Number(count) || 0 };
    } catch (err) {
      return failure('network', NETWORK_TEXT);
    }
  }

  // Fire and forget: tags the angle of freshly saved ads. Runs only when the
  // cached status is ready and VITE_AI_AUTO is not 0, at most
  // BACKGROUND_PER_CALL ads per call and BACKGROUND_PER_LOAD per page load.
  // Returns the promise of the call when one was made (tests wait on it).
  function classifyInBackground(adIds) {
    if (isDemo || String(auto ?? '').trim() === '0') return undefined;
    if (cachedStatus()?.state !== 'ready') return undefined;
    const left = BACKGROUND_PER_LOAD - backgroundUsed;
    if (left <= 0 || !Array.isArray(adIds)) return undefined;
    const ids = [...new Set(adIds.filter((id) => typeof id === 'string' && id))].slice(0, Math.min(BACKGROUND_PER_CALL, left));
    if (!ids.length) return undefined;
    backgroundUsed += ids.length;
    return call('classify', { adIds: ids })
      .then((r) => {
        if (!r.ok) debug('[ai] background tagging skipped:', r.code, r.message);
        return r;
      })
      .catch((err) => {
        debug('[ai] background tagging failed:', err);
        return failure('error', String(err?.message || err));
      });
  }

  return { aiStatus, cachedStatus, analyzeAd, classifyAds, buildBrief, countUnclassified, classifyInBackground };
}

const ai = createAi({ client: db, isDemo: IS_DEMO });
export const { aiStatus, cachedStatus, analyzeAd, classifyAds, buildBrief, countUnclassified, classifyInBackground } = ai;
