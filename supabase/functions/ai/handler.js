// The ai edge function, runtime agnostic. Everything from outside comes in
// through the second argument: `env` (name) => string | undefined, `fetch`,
// and `makeClient(apiKey)` that returns an Anthropic client. index.ts wires
// those up for Deno; the tests pass stubs.
//
// Every database and storage call is made with the caller's own token, so row
// level security applies exactly as it does in the app. The function never
// holds a service key.
import {
  fail, json, preflight, readJson, bearer, supabaseEnv, getUser, rest, isUuid,
} from '../_shared/http.js';
import { ANGLE_IDS } from '../_shared/angles.js';
import {
  ANALYSIS_SCHEMA, CLASSIFY_SCHEMA, BRIEF_SCHEMA, analyzePrompt, classifyPrompt, briefPrompt, hookLine,
} from './prompts.js';
import { callModel, sanitize } from './model.js';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

// Same words as the app's AI_FIX_TEXT.no_key. Copied, because a function
// cannot import from src/.
export const NO_KEY_TEXT =
  'Add ANTHROPIC_API_KEY to your edge function: supabase secrets set ANTHROPIC_API_KEY=your-key';

export const LIMITS = {
  briefAds: 20,
  briefHooks: 50,
  hookChars: 300,
  notesChars: 1000,
  titleChars: 120,
  fieldChars: 1200,
  remixMax: 5,
  remixChars: 300,
  briefCopyChars: 600,
};

const AD_COLUMNS = 'id,brand,hook,ad_copy,landing_url,format,platform,media_path,verdict,tags,metrics';
const CLASSIFY_COLUMNS = 'id,hook,ad_copy,metrics';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const cut = (s, n) => (s.length > n ? s.slice(0, n).trimEnd() : s);

export function config(env) {
  return {
    apiKey: env('ANTHROPIC_API_KEY') || null,
    model: env('AI_MODEL') || DEFAULT_MODEL,
    batchLimit: clamp(parseInt(env('AI_BATCH_LIMIT'), 10) || 20, 1, 50),
  };
}

const noKey = () => fail(412, 'no_key', NO_KEY_TEXT);

function modelFailure(result) {
  const extra = result.category ? { category: result.category } : {};
  return fail(result.status, result.code, result.message, extra);
}

function upstream(what, res) {
  const detail = res?.data?.message ? `: ${res.data.message}` : res?.status ? ` (status ${res.status})` : '';
  return fail(502, 'upstream', `${what}${detail}`);
}

// A clean model string: dashes out, trimmed, cut to max. '' when not a string.
const tidy = (v, max) => (typeof v === 'string' ? cut(sanitize(v).trim(), max) : '');

// Checks the analysis against the rules the schema cannot express.
// -> analysis object, or null when it does not hold.
export function validateAnalysis(data) {
  if (!data || typeof data !== 'object') return null;
  const out = {};
  for (const key of ['hook', 'format', 'audience', 'why_it_works', 'weaknesses']) {
    const value = tidy(data[key], LIMITS.fieldChars);
    if (!value) return null;
    out[key] = value;
  }
  if (!ANGLE_IDS.includes(data.angle)) return null;
  out.angle = data.angle;
  if (!Array.isArray(data.remix_ideas)) return null;
  // More than five ideas keeps the first five rather than wasting a paid answer.
  const ideas = data.remix_ideas.map((s) => tidy(s, LIMITS.remixChars)).filter(Boolean).slice(0, LIMITS.remixMax);
  if (!ideas.length) return null;
  out.remix_ideas = ideas;
  return out;
}

const angleFields = (angle, model, at) => ({ angle, angle_source: 'ai', angle_model: model, angle_at: at });

async function signImage({ fetch, env, token, sb, path }) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const res = await rest({
    fetch, env, token, method: 'POST', path: `/storage/v1/object/sign/ad-media/${encoded}`, body: { expiresIn: 300 },
  });
  const signed = res.ok && (res.data?.signedURL || res.data?.signedUrl);
  if (!signed) return null;
  if (/^https?:\/\//i.test(signed)) return signed;
  return `${sb.url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
}

async function analyze(ctx, body) {
  const { cfg, env, fetch, token, sb, makeClient, now } = ctx;
  if (!cfg.apiKey) return noKey();
  const adId = body.adId;
  if (!isUuid(adId)) return fail(400, 'bad_request', 'adId must be the uuid of an ad.');

  const read = await rest({ fetch, env, token, path: `/rest/v1/ads?id=eq.${adId}&select=${AD_COLUMNS}` });
  if (!read.ok) return upstream('Could not read the ad', read);
  const ad = Array.isArray(read.data) ? read.data[0] : null;
  if (!ad) return fail(400, 'bad_request', 'Ad not found.');

  const format = String(ad.format || 'image').toLowerCase();
  let imageUrl = null;
  if (format === 'image' && typeof ad.media_path === 'string' && ad.media_path && !ad.media_path.startsWith('demo/')) {
    imageUrl = await signImage({ fetch, env, token, sb, path: ad.media_path });
  }

  const client = makeClient(cfg.apiKey);
  const ask = (withImage) => {
    const { system, text } = analyzePrompt(ad, { imageAttached: withImage });
    const content = [];
    if (withImage) content.push({ type: 'image', source: { type: 'url', url: imageUrl } });
    content.push({ type: 'text', text });
    return callModel(client, {
      model: cfg.model, system, content, schema: ANALYSIS_SCHEMA, effort: 'low', maxTokens: 4000,
    });
  };

  let result = await ask(Boolean(imageUrl));
  // A 400 with an image attached is most often the image (format, size, an
  // expired link): one more try on the words alone.
  if (!result.ok && imageUrl && result.upstreamStatus === 400) result = await ask(false);
  if (!result.ok) return modelFailure(result);

  const checked = validateAnalysis(result.data);
  if (!checked) return fail(502, 'bad_output', 'The model answer was missing fields or out of range. Try again.');

  const at = now().toISOString();
  const analysis = { ...checked, model: cfg.model, analyzed_at: at };
  const before = ad.metrics && typeof ad.metrics === 'object' ? ad.metrics : {};
  const metrics = { ...before, ai: analysis };
  if (before.angle_source !== 'human') Object.assign(metrics, angleFields(checked.angle, cfg.model, at));

  const saved = await rest({
    fetch, env, token, method: 'PATCH', path: `/rest/v1/ads?id=eq.${adId}`, body: { metrics }, prefer: 'return=representation',
  });
  if (!saved.ok) return upstream('The analysis ran but could not be saved', saved);
  const row = Array.isArray(saved.data) && saved.data[0] ? saved.data[0] : { ...ad, metrics };
  return json(200, { ok: true, analysis, ad: row });
}

// "0-19/143" -> 143; null when the total is unknown.
export function totalFromContentRange(value) {
  const m = /\/(\d+)\s*$/.exec(String(value || ''));
  return m ? Number(m[1]) : null;
}

async function classify(ctx, body) {
  const { cfg, env, fetch, token, makeClient, now } = ctx;
  if (!cfg.apiKey) return noKey();
  const asked = parseInt(body.limit, 10);
  const n = clamp(asked > 0 ? asked : cfg.batchLimit, 1, cfg.batchLimit);

  let rows;
  let total;
  if (Array.isArray(body.adIds)) {
    const ids = [...new Set(body.adIds.filter(isUuid))].slice(0, n);
    if (!ids.length) return json(200, { ok: true, classified: 0, remaining: 0, capped: false, limit: n });
    const read = await rest({
      fetch, env, token, path: `/rest/v1/ads?id=in.(${ids.join(',')})&metrics->>angle=is.null&select=${CLASSIFY_COLUMNS}`,
    });
    if (!read.ok) return upstream('Could not read the ads to tag', read);
    rows = Array.isArray(read.data) ? read.data : [];
    total = rows.length;
  } else {
    const read = await rest({
      fetch, env, token,
      path: `/rest/v1/ads?metrics->>angle=is.null&or=(hook.not.is.null,ad_copy.not.is.null)&order=created_at.desc&limit=${n}&select=${CLASSIFY_COLUMNS}`,
      prefer: 'count=exact',
    });
    if (!read.ok) return upstream('Could not read the ads to tag', read);
    rows = Array.isArray(read.data) ? read.data : [];
    const counted = totalFromContentRange(read.headers?.get?.('content-range'));
    total = counted === null ? rows.length : Math.max(counted, rows.length);
  }

  // Never send a row a person already labelled, or one with no words to read.
  const batch = rows
    .filter((r) => r?.metrics?.angle_source !== 'human')
    .map((r) => ({ row: r, hook: hookLine(r, 200) }))
    .filter((x) => x.hook)
    .slice(0, n);
  if (!batch.length) return json(200, { ok: true, classified: 0, remaining: 0, capped: false, limit: n });

  const { system, text } = classifyPrompt(batch.map((x) => x.hook));
  const result = await callModel(makeClient(cfg.apiKey), {
    model: cfg.model, system, content: [{ type: 'text', text }], schema: CLASSIFY_SCHEMA, effort: 'low', maxTokens: 4000,
  });
  if (!result.ok) return modelFailure(result);
  const items = Array.isArray(result.data?.items) ? result.data.items : null;
  if (!items) return fail(502, 'bad_output', 'The model answer had no items. Try again.');

  const at = now().toISOString();
  const done = new Set();
  let classified = 0;
  for (const item of items) {
    const i = item?.i;
    if (!Number.isInteger(i) || i < 0 || i >= batch.length || done.has(i)) continue;
    if (!ANGLE_IDS.includes(item.angle)) continue;
    done.add(i);
    const { row } = batch[i];
    const metrics = { ...(row.metrics || {}), ...angleFields(item.angle, cfg.model, at) };
    // The angle filter means an angle a person set meanwhile is never replaced.
    const saved = await rest({
      fetch, env, token, method: 'PATCH',
      path: `/rest/v1/ads?id=eq.${row.id}&metrics->>angle=is.null`,
      body: { metrics },
      prefer: 'return=representation',
    });
    if (saved.ok && (!Array.isArray(saved.data) || saved.data.length > 0)) classified += 1;
  }
  return json(200, { ok: true, classified, remaining: Math.max(0, total - classified), capped: total > n, limit: n });
}

// The fallback when the briefs table predates the source columns: the sources
// go into the body as text so they are not lost.
export function sourcesText(ads, hooks) {
  const items = [
    ...ads.map((a) => [a.brand, hookLine(a, 120)].filter(Boolean).join(': ') || 'Untitled ad'),
    ...hooks,
  ];
  return items.join('; ');
}

async function brief(ctx, body, user) {
  const { cfg, env, fetch, token, makeClient } = ctx;
  if (!cfg.apiKey) return noKey();
  const rawIds = body.adIds == null ? [] : body.adIds;
  const rawHooks = body.hooks == null ? [] : body.hooks;
  if (!Array.isArray(rawIds) || !Array.isArray(rawHooks)) {
    return fail(400, 'bad_request', 'adIds and hooks must be lists.');
  }
  if (rawIds.some((id) => !isUuid(id))) return fail(400, 'bad_request', 'Every ad id must be a uuid.');
  const adIds = [...new Set(rawIds)];
  if (adIds.length > LIMITS.briefAds) {
    return fail(400, 'bad_request', `A brief takes at most ${LIMITS.briefAds} ads. You picked ${adIds.length}.`);
  }
  if (rawHooks.length > LIMITS.briefHooks) {
    return fail(400, 'bad_request', `A brief takes at most ${LIMITS.briefHooks} hooks. You picked ${rawHooks.length}.`);
  }
  const hooks = rawHooks
    .filter((h) => typeof h === 'string')
    .map((h) => cut(h.trim(), LIMITS.hookChars))
    .filter(Boolean);
  if (!adIds.length && !hooks.length) return fail(400, 'bad_request', 'Pick at least one ad or hook for the brief.');
  const notes = typeof body.notes === 'string' ? cut(body.notes.trim(), LIMITS.notesChars) : '';
  const givenTitle = typeof body.title === 'string' ? cut(sanitize(body.title).trim(), LIMITS.titleChars) : '';

  let ads = [];
  if (adIds.length) {
    const read = await rest({ fetch, env, token, path: `/rest/v1/ads?id=in.(${adIds.join(',')})&select=${AD_COLUMNS}` });
    if (!read.ok) return upstream('Could not read the ads for the brief', read);
    const found = new Map((Array.isArray(read.data) ? read.data : []).map((a) => [a.id, a]));
    ads = adIds.map((id) => found.get(id)).filter(Boolean);
    if (!ads.length && !hooks.length) return fail(400, 'bad_request', 'None of those ads were found.');
  }

  const { system, text } = briefPrompt({ ads, hooks, notes });
  const result = await callModel(makeClient(cfg.apiKey), {
    model: cfg.model, system, content: [{ type: 'text', text }], schema: BRIEF_SCHEMA, effort: 'medium', maxTokens: 8000,
  });
  if (!result.ok) return modelFailure(result);
  const title = givenTitle || tidy(result.data?.title, LIMITS.titleChars);
  const bodyText = typeof result.data?.body === 'string' ? sanitize(result.data.body).trim() : '';
  if (!title || !bodyText) return fail(502, 'bad_output', 'The model answer had no title or no body. Try again.');

  const full = {
    title,
    body: bodyText,
    added_by_email: 'claude@analysis',
    requested_by_email: user?.email || null,
    source_ad_ids: ads.map((a) => a.id),
    source_hooks: hooks,
  };
  let saved = await rest({
    fetch, env, token, method: 'POST', path: '/rest/v1/briefs', body: full, prefer: 'return=representation',
  });
  if (!saved.ok && saved.data?.code === 'PGRST204') {
    const sources = sourcesText(ads, hooks);
    saved = await rest({
      fetch, env, token, method: 'POST', path: '/rest/v1/briefs', prefer: 'return=representation',
      body: { title, body: sources ? `${bodyText}\n\nSources: ${sources}` : bodyText, added_by_email: 'claude@analysis' },
    });
  }
  if (!saved.ok) {
    const detail = saved.data?.message ? `: ${saved.data.message}` : '';
    return fail(502, 'upstream', `The brief was written but could not be saved${detail}`, { draft: { title, body: bodyText } });
  }
  const row = Array.isArray(saved.data) ? saved.data[0] : saved.data;
  return json(200, { ok: true, brief: row || { title, body: bodyText } });
}

export async function handle(req, { env, fetch, makeClient, now = () => new Date() }) {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');
  const sb = supabaseEnv(env);
  if (!sb) return fail(500, 'misconfigured', 'SUPABASE_URL or SUPABASE_ANON_KEY is missing from the function environment.');
  const read = await readJson(req);
  if (!read.ok) return read.response;
  const token = bearer(req);
  const who = await getUser({ fetch, env, token });
  if (who.response) return who.response;

  const cfg = config(env);
  const ctx = { cfg, env, fetch, token, sb, makeClient, now };
  const { action } = read.body;
  try {
    if (action === 'status') return json(200, { ok: true, ready: Boolean(cfg.apiKey), model: cfg.model, batchLimit: cfg.batchLimit });
    if (action === 'analyze') return await analyze(ctx, read.body);
    if (action === 'classify') return await classify(ctx, read.body);
    if (action === 'brief') return await brief(ctx, read.body, who.user);
  } catch (err) {
    return fail(500, 'internal', `The ai function failed: ${String(err?.message || err)}`);
  }
  const named = typeof action === 'string' && action ? ` ${action.slice(0, 40)}` : '';
  return fail(400, 'bad_request', `Unknown action${named}. Use status, analyze, classify or brief.`);
}
