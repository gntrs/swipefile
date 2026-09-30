import { describe, it, expect } from 'vitest';
import { handle, config, DEFAULT_MODEL, NO_KEY_TEXT, validateAnalysis, totalFromContentRange, sourcesText } from '../../supabase/functions/ai/handler.js';
import { AI_FIX_TEXT } from '../../src/lib/ai.js';
import {
  SB_URL, BASE_ENV, USER, AD_ID, AD_ID_2, AD_ID_3, NOW, envOf, jsonResponse, stubFetch, message, stubClient, post,
  GOOD_ANALYSIS, adRow,
} from './helpers.js';

const DASH_A = String.fromCharCode(0x2014);
const DASH_B = String.fromCharCode(0x2013);
const hasDash = (s) => s.includes(DASH_A) || s.includes(DASH_B);

async function run(body, { env = BASE_ENV, routes = [], answers = [], auth, req } = {}) {
  const fetch = stubFetch(routes, { auth });
  const model = stubClient(answers);
  const res = await handle(req || post(body), { env: envOf(env), fetch, makeClient: model.makeClient, now: () => NOW });
  const text = await res.text();
  return { res, status: res.status, body: text ? JSON.parse(text) : null, fetch, ...model };
}

const isAdRead = (c) => c.method === 'GET' && c.url.startsWith(`${SB_URL}/rest/v1/ads?id=eq.`);
const isSign = (c) => c.method === 'POST' && c.url.startsWith(`${SB_URL}/storage/v1/object/sign/ad-media/`);
const isAdPatch = (c) => c.method === 'PATCH' && c.url.startsWith(`${SB_URL}/rest/v1/ads?id=eq.`);

function analyzeRoutes(ad = adRow(), { sign = true, patch } = {}) {
  return [
    { match: isAdRead, reply: () => jsonResponse(200, ad ? [ad] : []) },
    { match: isSign, reply: () => (sign ? jsonResponse(200, { signedURL: '/object/sign/ad-media/x.jpg?token=t' }) : jsonResponse(400, { message: 'nope' })) },
    { match: isAdPatch, reply: patch || ((c) => jsonResponse(200, [{ ...ad, ...c.body }])) },
  ];
}

describe('config', () => {
  it('defaults', () => {
    expect(config(envOf({}))).toEqual({ apiKey: null, model: DEFAULT_MODEL, batchLimit: 20 });
    expect(DEFAULT_MODEL).toBe('claude-sonnet-5-5');
  });
  it('AI_MODEL override', () => {
    expect(config(envOf({ AI_MODEL: 'claude-opus-5-5' })).model).toBe('claude-opus-5-5');
  });
  it('AI_BATCH_LIMIT is clamped to 1..50, junk falls back to 20', () => {
    expect(config(envOf({ AI_BATCH_LIMIT: '500' })).batchLimit).toBe(50);
    expect(config(envOf({ AI_BATCH_LIMIT: '0' })).batchLimit).toBe(20);
    expect(config(envOf({ AI_BATCH_LIMIT: '-3' })).batchLimit).toBe(1);
    expect(config(envOf({ AI_BATCH_LIMIT: 'x' })).batchLimit).toBe(20);
    expect(config(envOf({ AI_BATCH_LIMIT: '7' })).batchLimit).toBe(7);
  });
  it('the no key text matches the app', () => {
    expect(NO_KEY_TEXT).toBe(AI_FIX_TEXT.no_key);
  });
});

describe('request handling', () => {
  it('OPTIONS answers 204 with CORS', async () => {
    const r = await run(null, { req: new Request('https://fn.example/ai', { method: 'OPTIONS' }) });
    expect(r.status).toBe(204);
    expect(r.res.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.fetch).not.toHaveBeenCalled();
  });
  it('GET is 405', async () => {
    const r = await run(null, { req: new Request('https://fn.example/ai') });
    expect(r.status).toBe(405);
    expect(r.body.error.code).toBe('method_not_allowed');
  });
  it('bad JSON is 400', async () => {
    const r = await run(null, { req: post(null, { raw: '{nope' }) });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('bad_request');
  });
  it('unknown or missing action is 400', async () => {
    expect((await run({ action: 'dance' })).status).toBe(400);
    const r = await run({});
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/Use status, analyze, classify or brief/);
  });
  it('missing SUPABASE_URL is 500 misconfigured', async () => {
    const r = await run({ action: 'status' }, { env: { SUPABASE_ANON_KEY: 'a' } });
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('misconfigured');
  });
  it('no bearer is 401 without calling auth', async () => {
    const r = await run(null, { req: post({ action: 'status' }, { token: null }) });
    expect(r.status).toBe(401);
    expect(r.fetch).not.toHaveBeenCalled();
  });
  it('auth answering 401 is 401', async () => {
    const r = await run({ action: 'status' }, { auth: () => jsonResponse(401, { message: 'bad jwt' }) });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('unauthorized');
  });
});

describe('status', () => {
  it('ready with a key, no model call', async () => {
    const r = await run({ action: 'status' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, ready: true, model: DEFAULT_MODEL, batchLimit: 20 });
    expect(r.makeClient).not.toHaveBeenCalled();
  });
  it('not ready without a key', async () => {
    const { ANTHROPIC_API_KEY, ...env } = BASE_ENV;
    const r = await run({ action: 'status' }, { env });
    expect(r.body).toEqual({ ok: true, ready: false, model: DEFAULT_MODEL, batchLimit: 20 });
  });
  it('reports AI_MODEL and AI_BATCH_LIMIT', async () => {
    const r = await run({ action: 'status' }, { env: { ...BASE_ENV, AI_MODEL: 'm-1', AI_BATCH_LIMIT: '500' } });
    expect(r.body).toMatchObject({ model: 'm-1', batchLimit: 50 });
  });
});

describe('analyze', () => {
  it('no key is 412 no_key with the fix text', async () => {
    const { ANTHROPIC_API_KEY, ...env } = BASE_ENV;
    const r = await run({ action: 'analyze', adId: AD_ID }, { env });
    expect(r.status).toBe(412);
    expect(r.body.error).toEqual({ code: 'no_key', message: AI_FIX_TEXT.no_key });
  });
  it('a bad id is 400 without reading anything', async () => {
    const r = await run({ action: 'analyze', adId: 'nope' }, { answers: [message(GOOD_ANALYSIS)] });
    expect(r.status).toBe(400);
    expect(r.fetch.calls.filter((c) => c.url.includes('/rest/'))).toHaveLength(0);
  });
  it('a missing ad is 400 Ad not found.', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(null), answers: [message(GOOD_ANALYSIS)] });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toBe('Ad not found.');
    expect(r.create).not.toHaveBeenCalled();
  });
  it('reads the ad as the caller, with the listed columns', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [message(GOOD_ANALYSIS)] });
    const read = r.fetch.calls.find(isAdRead);
    expect(read.url).toBe(`${SB_URL}/rest/v1/ads?id=eq.${AD_ID}&select=id,brand,hook,ad_copy,landing_url,format,platform,media_path,verdict,tags,metrics`);
    expect(read.headers.Authorization).toBe('Bearer user-token');
  });
  it('an image ad sends an image block with the signed URL before the text', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [message(GOOD_ANALYSIS)] });
    expect(r.status).toBe(200);
    const sign = r.fetch.calls.find(isSign);
    expect(sign.body).toEqual({ expiresIn: 300 });
    expect(sign.url).toBe(`${SB_URL}/storage/v1/object/sign/ad-media/${USER.id}/1700000000000-abcd1234.jpg`);
    const req = r.create.mock.calls[0][0];
    expect(req.model).toBe(DEFAULT_MODEL);
    expect(req.max_tokens).toBe(4000);
    expect(req.output_config.effort).toBe('low');
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req).not.toHaveProperty('thinking');
    const content = req.messages[0].content;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'url', url: `${SB_URL}/storage/v1/object/sign/ad-media/x.jpg?token=t` } });
    expect(content[1].type).toBe('text');
    expect(content[1].text).toMatch(/The ad image is attached above/);
  });
  it('a video ad sends text only and says the video was not seen', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(adRow({ format: 'video' })), answers: [message(GOOD_ANALYSIS)] });
    expect(r.fetch.calls.find(isSign)).toBeUndefined();
    const content = r.create.mock.calls[0][0].messages[0].content;
    expect(content).toHaveLength(1);
    expect(content[0].text).toMatch(/The video itself is not attached; judge the copy\./);
  });
  it('demo media and no media are not signed', async () => {
    for (const media_path of ['demo/x.svg', null]) {
      const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(adRow({ media_path })), answers: [message(GOOD_ANALYSIS)] });
      expect(r.fetch.calls.find(isSign)).toBeUndefined();
      expect(r.create.mock.calls[0][0].messages[0].content).toHaveLength(1);
    }
  });
  it('a failed signing falls back to text only', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(adRow(), { sign: false }), answers: [message(GOOD_ANALYSIS)] });
    expect(r.status).toBe(200);
    expect(r.create.mock.calls[0][0].messages[0].content).toHaveLength(1);
  });
  it('saved metrics keep every other key and add ai plus the angle', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [message(GOOD_ANALYSIS)] });
    const patch = r.fetch.calls.find(isAdPatch);
    expect(patch.url).toBe(`${SB_URL}/rest/v1/ads?id=eq.${AD_ID}`);
    expect(patch.headers.Prefer).toBe('return=representation');
    const m = patch.body.metrics;
    expect(m).toMatchObject({ starred: true, days_running: 40, live: true });
    expect(m.ai).toEqual({ ...GOOD_ANALYSIS, model: DEFAULT_MODEL, analyzed_at: NOW.toISOString() });
    expect(m).toMatchObject({ angle: 'social_proof', angle_source: 'ai', angle_model: DEFAULT_MODEL, angle_at: NOW.toISOString() });
    expect(r.body.ok).toBe(true);
    expect(r.body.analysis.why_it_works).toBe(GOOD_ANALYSIS.why_it_works);
    expect(r.body.ad.metrics.ai.hook).toBe(GOOD_ANALYSIS.hook);
  });
  it('a human angle is kept while ai is written', async () => {
    const ad = adRow({ metrics: { angle: 'story', angle_source: 'human', starred: true } });
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(ad), answers: [message(GOOD_ANALYSIS)] });
    const m = r.fetch.calls.find(isAdPatch).body.metrics;
    expect(m.angle).toBe('story');
    expect(m.angle_source).toBe('human');
    expect(m).not.toHaveProperty('angle_model');
    expect(m.ai.angle).toBe('social_proof');
  });
  it('refusal is 422 with the category', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, {
      routes: analyzeRoutes(),
      answers: [{ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' }, content: [] }],
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({ code: 'refused', category: 'cyber' });
    expect(r.fetch.calls.find(isAdPatch)).toBeUndefined();
  });
  it('refusal without a category leaves it out', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [{ stop_reason: 'refusal', stop_details: null, content: [] }] });
    expect(r.status).toBe(422);
    expect(r.body.error).not.toHaveProperty('category');
  });
  it('max_tokens is 502 truncated', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [message('{"hook":', { stop_reason: 'max_tokens' })] });
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('truncated');
  });
  it('not JSON is 502 bad_output', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [message('here is my analysis')] });
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('bad_output');
  });
  it('no text block is 502 bad_output', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [{ stop_reason: 'end_turn', content: [] }] });
    expect(r.body.error.code).toBe('bad_output');
  });
  it('an angle outside the enum is 502 bad_output and nothing is saved', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [message({ ...GOOD_ANALYSIS, angle: 'vibes' })] });
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('bad_output');
    expect(r.fetch.calls.find(isAdPatch)).toBeUndefined();
  });
  it('a missing or empty field, or no remix ideas, is bad_output', async () => {
    for (const bad of [{ ...GOOD_ANALYSIS, audience: '  ' }, { ...GOOD_ANALYSIS, hook: undefined }, { ...GOOD_ANALYSIS, remix_ideas: [] }, { ...GOOD_ANALYSIS, remix_ideas: 'x' }]) {
      const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [message(bad)] });
      expect(r.body.error.code).toBe('bad_output');
    }
  });
  it('401 from the SDK is 412 bad_key', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [{ throw: { status: 401 } }] });
    expect(r.status).toBe(412);
    expect(r.body.error).toEqual({ code: 'bad_key', message: AI_FIX_TEXT.bad_key });
  });
  it('403 from the SDK is also bad_key', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [{ throw: { status: 403 } }] });
    expect(r.body.error.code).toBe('bad_key');
  });
  it('429 is 429 rate_limited', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [{ throw: { status: 429 } }] });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('rate_limited');
  });
  it('404 names the model', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, { env: { ...BASE_ENV, AI_MODEL: 'old-model' }, routes: analyzeRoutes(), answers: [{ throw: { status: 404 } }] });
    expect(r.status).toBe(502);
    expect(r.body.error.message).toBe('Model old-model not found. Set AI_MODEL to a current model id.');
  });
  it('a connection error or a 500 is 502 upstream', async () => {
    for (const t of [{ message: 'socket hang up' }, { status: 529 }]) {
      const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [{ throw: t }] });
      expect(r.status).toBe(502);
      expect(r.body.error.code).toBe('upstream');
    }
  });
  it('400 with an image retries once without it', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, {
      routes: analyzeRoutes(),
      answers: [{ throw: { status: 400, error: { error: { message: 'Could not fetch image' } } } }, message(GOOD_ANALYSIS)],
    });
    expect(r.status).toBe(200);
    expect(r.create).toHaveBeenCalledTimes(2);
    expect(r.create.mock.calls[0][0].messages[0].content[0].type).toBe('image');
    expect(r.create.mock.calls[1][0].messages[0].content).toHaveLength(1);
    expect(r.create.mock.calls[1][0].messages[0].content[0].text).toMatch(/No image is attached/);
  });
  it('400 without an image is 502 upstream with the API message, no retry', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, {
      routes: analyzeRoutes(adRow({ format: 'video' })),
      answers: [{ throw: { status: 400, error: { error: { message: 'prompt is too long' } } } }],
    });
    expect(r.status).toBe(502);
    expect(r.body.error.message).toBe('prompt is too long');
    expect(r.create).toHaveBeenCalledTimes(1);
  });
  it('dashes in model output never reach the saved row', async () => {
    const dashy = {
      ...GOOD_ANALYSIS,
      why_it_works: `Short ${DASH_A} and sharp, runs 3${DASH_B}5 weeks`,
      remix_ideas: [`${DASH_A} lead with price`, `Test it${DASH_B}again`],
    };
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [message(dashy)] });
    const saved = JSON.stringify(r.fetch.calls.find(isAdPatch).body);
    expect(hasDash(saved)).toBe(false);
    const ai = r.fetch.calls.find(isAdPatch).body.metrics.ai;
    expect(ai.why_it_works).toBe('Short, and sharp, runs 3 to 5 weeks');
    expect(ai.remix_ideas).toEqual(['lead with price', 'Test it, again']);
  });
  it('long fields are cut to 1,200 characters and at most five remix ideas are kept', async () => {
    const long = { ...GOOD_ANALYSIS, weaknesses: 'w'.repeat(5000), remix_ideas: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => x.repeat(400)) };
    const r = await run({ action: 'analyze', adId: AD_ID }, { routes: analyzeRoutes(), answers: [message(long)] });
    const ai = r.fetch.calls.find(isAdPatch).body.metrics.ai;
    expect(ai.weaknesses).toHaveLength(1200);
    expect(ai.remix_ideas).toHaveLength(5);
    expect(ai.remix_ideas.every((s) => s.length === 300)).toBe(true);
  });
  it('a failed save is 502 upstream', async () => {
    const r = await run({ action: 'analyze', adId: AD_ID }, {
      routes: analyzeRoutes(adRow(), { patch: () => jsonResponse(403, { message: 'row level security' }) }),
      answers: [message(GOOD_ANALYSIS)],
    });
    expect(r.status).toBe(502);
    expect(r.body.error.message).toMatch(/could not be saved: row level security/);
  });
});

describe('validateAnalysis', () => {
  it('rejects non objects', () => {
    expect(validateAnalysis(null)).toBeNull();
    expect(validateAnalysis('x')).toBeNull();
  });
  it('trims fields', () => {
    expect(validateAnalysis({ ...GOOD_ANALYSIS, hook: '  spaced  ' }).hook).toBe('spaced');
  });
});

// Ads for classify: `n` rows with hooks.
const classifyRows = (n, over = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`,
    hook: `Hook number ${i}`,
    ad_copy: null,
    metrics: { starred: i === 0 },
    ...over,
  }));

function classifyRoutes(rows, { total, patch } = {}) {
  return [
    {
      match: (c) => c.method === 'GET' && c.url.startsWith(`${SB_URL}/rest/v1/ads?`),
      reply: () => jsonResponse(200, rows, total === undefined ? {} : { 'content-range': `0-${Math.max(0, rows.length - 1)}/${total}` }),
    },
    { match: isAdPatch, reply: patch || ((c) => jsonResponse(200, [{ id: 'x', ...c.body }])) },
  ];
}

describe('classify', () => {
  it('no key is 412', async () => {
    const { ANTHROPIC_API_KEY, ...env } = BASE_ENV;
    const r = await run({ action: 'classify' }, { env });
    expect(r.status).toBe(412);
    expect(r.body.error.code).toBe('no_key');
  });
  it('nothing to do makes no model call', async () => {
    const r = await run({ action: 'classify' }, { routes: classifyRoutes([], { total: 0 }), answers: [message({ items: [] })] });
    expect(r.body).toEqual({ ok: true, classified: 0, remaining: 0, capped: false, limit: 20 });
    expect(r.makeClient).not.toHaveBeenCalled();
    expect(r.create).not.toHaveBeenCalled();
  });
  it('asks for the newest untagged ads with a count, limited to the batch', async () => {
    const rows = classifyRows(3);
    const r = await run({ action: 'classify' }, { routes: classifyRoutes(rows, { total: 3 }), answers: [message({ items: [] })] });
    const read = r.fetch.calls.find((c) => c.method === 'GET' && c.url.includes('/rest/v1/ads?'));
    expect(read.url).toBe(`${SB_URL}/rest/v1/ads?metrics->>angle=is.null&or=(hook.not.is.null,ad_copy.not.is.null)&order=created_at.desc&limit=20&select=id,hook,ad_copy,metrics`);
    expect(read.headers.Prefer).toBe('count=exact');
  });
  it('the batch is capped at the limit, whatever is asked', async () => {
    const r = await run({ action: 'classify', limit: 500 }, { env: { ...BASE_ENV, AI_BATCH_LIMIT: '5' }, routes: classifyRoutes(classifyRows(5), { total: 40 }), answers: [message({ items: [] })] });
    expect(r.fetch.calls.find((c) => c.method === 'GET' && c.url.includes('/rest/v1/ads?')).url).toContain('&limit=5&');
    expect(r.body).toMatchObject({ limit: 5, capped: true });
    const r2 = await run({ action: 'classify', limit: 2 }, { routes: classifyRoutes(classifyRows(2), { total: 2 }), answers: [message({ items: [] })] });
    expect(r2.body.limit).toBe(2);
  });
  it('one model call numbers the hooks from 0 and PATCHes only untagged rows', async () => {
    const rows = classifyRows(3);
    const r = await run({ action: 'classify' }, {
      routes: classifyRoutes(rows, { total: 143 }),
      answers: [message({ items: [{ i: 0, angle: 'pain' }, { i: 2, angle: 'offer' }] })],
    });
    expect(r.create).toHaveBeenCalledTimes(1);
    const req = r.create.mock.calls[0][0];
    expect(req.output_config.effort).toBe('low');
    expect(req.max_tokens).toBe(4000);
    expect(req.messages[0].content[0].text).toContain('0: Hook number 0\n1: Hook number 1\n2: Hook number 2');
    const patches = r.fetch.calls.filter(isAdPatch);
    expect(patches).toHaveLength(2);
    expect(patches[0].url).toBe(`${SB_URL}/rest/v1/ads?id=eq.${rows[0].id}&metrics->>angle=is.null`);
    expect(patches[0].body.metrics).toEqual({ starred: true, angle: 'pain', angle_source: 'ai', angle_model: DEFAULT_MODEL, angle_at: NOW.toISOString() });
    expect(patches[1].body.metrics.angle).toBe('offer');
    expect(r.body).toEqual({ ok: true, classified: 2, remaining: 141, capped: true, limit: 20 });
  });
  it('remaining comes from Content-Range', async () => {
    const r = await run({ action: 'classify' }, { routes: classifyRoutes(classifyRows(2), { total: 2 }), answers: [message({ items: [{ i: 0, angle: 'pain' }, { i: 1, angle: 'story' }] })] });
    expect(r.body).toEqual({ ok: true, classified: 2, remaining: 0, capped: false, limit: 20 });
  });
  it('out of range, repeated, non integer and unknown angle items are ignored', async () => {
    const r = await run({ action: 'classify' }, {
      routes: classifyRoutes(classifyRows(2), { total: 2 }),
      answers: [message({ items: [{ i: 5, angle: 'pain' }, { i: -1, angle: 'pain' }, { i: 0.5, angle: 'pain' }, { i: 1, angle: 'vibes' }, { i: 0, angle: 'story' }, { i: 0, angle: 'pain' }] })],
    });
    const patches = r.fetch.calls.filter(isAdPatch);
    expect(patches).toHaveLength(1);
    expect(patches[0].body.metrics.angle).toBe('story');
    expect(r.body.classified).toBe(1);
  });
  it('a row a person tagged meanwhile (PATCH matches nothing) is not counted', async () => {
    const r = await run({ action: 'classify' }, {
      routes: classifyRoutes(classifyRows(1), { total: 1, patch: () => jsonResponse(200, []) }),
      answers: [message({ items: [{ i: 0, angle: 'pain' }] })],
    });
    expect(r.body.classified).toBe(0);
    expect(r.body.remaining).toBe(1);
  });
  it('rows marked human or with no words are never sent', async () => {
    const rows = [
      ...classifyRows(1, { metrics: { angle_source: 'human' } }),
      { id: AD_ID_2, hook: '  ', ad_copy: '', metrics: {} },
      { id: AD_ID_3, hook: null, ad_copy: '\n  First line of copy\nsecond', metrics: {} },
    ];
    const r = await run({ action: 'classify' }, { routes: classifyRoutes(rows, { total: 3 }), answers: [message({ items: [{ i: 0, angle: 'how_to' }] })] });
    const text = r.create.mock.calls[0][0].messages[0].content[0].text;
    expect(text).toContain('0: First line of copy');
    expect(text).not.toContain('1:');
    expect(r.fetch.calls.filter(isAdPatch)[0].url).toContain(AD_ID_3);
  });
  it('with adIds: only uuids, at most the limit, filtered on untagged', async () => {
    const ids = [AD_ID, 'junk', AD_ID_2, AD_ID_3];
    const r = await run({ action: 'classify', adIds: ids, limit: 2 }, { routes: classifyRoutes([]), answers: [message({ items: [] })] });
    const read = r.fetch.calls.find((c) => c.method === 'GET' && c.url.includes('/rest/v1/ads?'));
    expect(read.url).toBe(`${SB_URL}/rest/v1/ads?id=in.(${AD_ID},${AD_ID_2})&metrics->>angle=is.null&select=id,hook,ad_copy,metrics`);
    expect(r.body.classified).toBe(0);
    expect(r.create).not.toHaveBeenCalled();
  });
  it('with only junk adIds does nothing and reads nothing', async () => {
    const r = await run({ action: 'classify', adIds: ['junk'] }, { routes: classifyRoutes([]) });
    expect(r.body).toEqual({ ok: true, classified: 0, remaining: 0, capped: false, limit: 20 });
    expect(r.fetch.calls.filter((c) => c.url.includes('/rest/'))).toHaveLength(0);
  });
  it('an answer without items is bad_output', async () => {
    const r = await run({ action: 'classify' }, { routes: classifyRoutes(classifyRows(1), { total: 1 }), answers: [message({ nope: true })] });
    expect(r.body.error.code).toBe('bad_output');
  });
});

describe('totalFromContentRange', () => {
  it('reads the total', () => {
    expect(totalFromContentRange('0-19/143')).toBe(143);
    expect(totalFromContentRange('*/0')).toBe(0);
    expect(totalFromContentRange('0-19/*')).toBeNull();
    expect(totalFromContentRange(null)).toBeNull();
  });
});

const BRIEF = { title: 'Next round: proof first', body: 'Goal: more trials.\nAudience: busy people.' };
const isBriefPost = (c) => c.method === 'POST' && c.url === `${SB_URL}/rest/v1/briefs`;

function briefRoutes(ads = [adRow(), adRow({ id: AD_ID_2, brand: 'Lumen Desk', hook: 'Your lamp knows the time', metrics: { angle: 'curiosity', ai: { why_it_works: 'It surprises.' } } })], { insert } = {}) {
  return [
    { match: (c) => c.method === 'GET' && c.url.startsWith(`${SB_URL}/rest/v1/ads?id=in.`), reply: () => jsonResponse(200, ads) },
    { match: isBriefPost, reply: insert || ((c) => jsonResponse(201, [{ id: 'b-1', created_at: NOW.toISOString(), ...c.body }])) },
  ];
}

describe('brief', () => {
  it('no key is 412', async () => {
    const { ANTHROPIC_API_KEY, ...env } = BASE_ENV;
    expect((await run({ action: 'brief', adIds: [AD_ID] }, { env })).status).toBe(412);
  });
  it('the caps: empty, over 20 ads, over 50 hooks, non uuid ids, not lists', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(200 + i).padStart(12, '0')}`);
    const cases = [
      [{}, /at least one ad or hook/],
      [{ adIds: [], hooks: ['  '] }, /at least one ad or hook/],
      [{ adIds: ids }, /at most 20 ads\. You picked 21/],
      [{ hooks: Array(51).fill('h') }, /at most 50 hooks\. You picked 51/],
      [{ adIds: ['nope'] }, /uuid/],
      [{ adIds: 'x' }, /must be lists/],
    ];
    for (const [args, re] of cases) {
      const r = await run({ action: 'brief', ...args }, { routes: briefRoutes(), answers: [message(BRIEF)] });
      expect(r.status).toBe(400);
      expect(r.body.error.message).toMatch(re);
      expect(r.create).not.toHaveBeenCalled();
    }
  });
  it('exactly 20 ads and 50 hooks are fine', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `00000000-0000-4000-8000-${String(200 + i).padStart(12, '0')}`);
    const r = await run({ action: 'brief', adIds: ids, hooks: Array(50).fill('h') }, { routes: briefRoutes(), answers: [message(BRIEF)] });
    expect(r.status).toBe(200);
  });
  it('writes the brief with its sources and returns the row', async () => {
    const r = await run({ action: 'brief', adIds: [AD_ID, AD_ID_2], hooks: ['  Hook one  ', 'x'.repeat(400)], notes: 'n'.repeat(2000) }, { routes: briefRoutes(), answers: [message(BRIEF)] });
    expect(r.status).toBe(200);
    const req = r.create.mock.calls[0][0];
    expect(req.output_config.effort).toBe('medium');
    expect(req.max_tokens).toBe(8000);
    const text = req.messages[0].content[0].text;
    expect(text).toContain('Brand: Lumen Desk');
    expect(text).toContain('Why it works: It surprises.');
    expect(text).toContain('Angle: Curiosity');
    expect(text).toContain('- Hook one');
    expect(text).toContain(`Notes from the person asking: ${'n'.repeat(1000)}\n`);
    const insert = r.fetch.calls.find(isBriefPost);
    expect(insert.headers.Prefer).toBe('return=representation');
    expect(insert.body).toEqual({
      title: BRIEF.title,
      body: BRIEF.body,
      added_by_email: 'claude@analysis',
      requested_by_email: USER.email,
      source_ad_ids: [AD_ID, AD_ID_2],
      source_hooks: ['Hook one', 'x'.repeat(300)],
    });
    expect(r.body.brief).toMatchObject({ id: 'b-1', title: BRIEF.title });
  });
  it('a given title wins and is cut to 120', async () => {
    const r = await run({ action: 'brief', hooks: ['h'], title: 't'.repeat(200) }, { routes: briefRoutes(), answers: [message(BRIEF)] });
    expect(r.fetch.calls.find(isBriefPost).body.title).toBe('t'.repeat(120));
  });
  it('dashes are stripped from title and body', async () => {
    const r = await run({ action: 'brief', hooks: ['h'] }, { routes: briefRoutes(), answers: [message({ title: `A ${DASH_A} B`, body: `Run 2${DASH_B}3 weeks` })] });
    const b = r.fetch.calls.find(isBriefPost).body;
    expect(b.title).toBe('A, B');
    expect(b.body).toBe('Run 2 to 3 weeks');
  });
  it('an empty title or body is bad_output', async () => {
    const r = await run({ action: 'brief', hooks: ['h'] }, { routes: briefRoutes(), answers: [message({ title: '', body: 'x' })] });
    expect(r.body.error.code).toBe('bad_output');
    expect(r.fetch.calls.find(isBriefPost)).toBeUndefined();
  });
  it('ads that are not found are left out; none found and no hooks is 400', async () => {
    const r = await run({ action: 'brief', adIds: [AD_ID, AD_ID_3] }, { routes: briefRoutes([adRow()]), answers: [message(BRIEF)] });
    expect(r.fetch.calls.find(isBriefPost).body.source_ad_ids).toEqual([AD_ID]);
    const none = await run({ action: 'brief', adIds: [AD_ID_3] }, { routes: briefRoutes([]), answers: [message(BRIEF)] });
    expect(none.status).toBe(400);
    expect(none.body.error.message).toBe('None of those ads were found.');
  });
  it('PGRST204 retries without the new columns and keeps the sources as text', async () => {
    let n = 0;
    const r = await run({ action: 'brief', adIds: [AD_ID, AD_ID_2], hooks: ['A plain hook'] }, {
      routes: briefRoutes(undefined, {
        insert: (c) => (n++ === 0
          ? jsonResponse(400, { code: 'PGRST204', message: "Could not find the 'source_ad_ids' column of 'briefs' in the schema cache" })
          : jsonResponse(201, [{ id: 'b-2', ...c.body }])),
      }),
      answers: [message(BRIEF)],
    });
    expect(r.status).toBe(200);
    const inserts = r.fetch.calls.filter(isBriefPost);
    expect(inserts).toHaveLength(2);
    expect(inserts[1].body).toEqual({
      title: BRIEF.title,
      body: `${BRIEF.body}\n\nSources: Driftwood Oats: I stopped skipping breakfast; Lumen Desk: Your lamp knows the time; A plain hook`,
      added_by_email: 'claude@analysis',
    });
    expect(r.body.brief.id).toBe('b-2');
  });
  it('another insert failure is 502 and hands back the draft', async () => {
    const r = await run({ action: 'brief', hooks: ['h'] }, { routes: briefRoutes([], { insert: () => jsonResponse(403, { code: '42501', message: 'denied' }) }), answers: [message(BRIEF)] });
    expect(r.status).toBe(502);
    expect(r.body.error.draft).toEqual(BRIEF);
    expect(r.fetch.calls.filter(isBriefPost)).toHaveLength(1);
  });
  it('model failures pass through', async () => {
    const r = await run({ action: 'brief', hooks: ['h'] }, { routes: briefRoutes(), answers: [{ throw: { status: 429 } }] });
    expect(r.status).toBe(429);
  });
});

describe('sourcesText', () => {
  it('lists brand and hook, then hooks', () => {
    expect(sourcesText([{ brand: 'B', hook: 'H' }, { brand: null, hook: null, ad_copy: null }], ['x'])).toBe('B: H; Untitled ad; x');
  });
});
