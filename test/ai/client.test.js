import { describe, it, expect, vi } from 'vitest';
import {
  createAi, mapInvokeError, AI_FIX_TEXT, AI_FIX_COMMAND, NETWORK_TEXT, STATUS_TTL_MS, BACKGROUND_PER_CALL, BACKGROUND_PER_LOAD,
} from '../../src/lib/ai.js';

// Errors shaped like supabase-js functions errors.
const httpError = (status, body) => ({
  name: 'FunctionsHttpError',
  message: 'Edge Function returned a non-2xx status code',
  context: new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
});
const envelope = (code, message, extra = {}) => ({ ok: false, error: { code, message, ...extra } });

// A stub supabase client. `answers` is a function (action, body) -> { data, error }.
function stubClient({ answers = () => ({ data: { ok: true }, error: null }), session = { user: { id: 'u' } }, count = 0, countError = null } = {}) {
  const invoke = vi.fn(async (name, { body }) => answers(body.action, body));
  const is = vi.fn(async () => ({ count, error: countError }));
  const select = vi.fn(() => ({ is }));
  const from = vi.fn(() => ({ select }));
  return {
    client: { auth: { getSession: vi.fn(async () => ({ data: { session } })) }, functions: { invoke }, from },
    invoke, from, select, is,
  };
}

const READY = (action) => (action === 'status' ? { data: { ok: true, ready: true, model: 'claude-sonnet-5-5', batchLimit: 20 }, error: null } : { data: { ok: true, classified: 1, remaining: 0, capped: false, limit: 20 }, error: null });

describe('mapInvokeError', () => {
  it('reads the function envelope and uses the app texts for known codes', async () => {
    expect(await mapInvokeError(httpError(412, envelope('no_key', 'x')))).toEqual({ ok: false, code: 'no_key', message: AI_FIX_TEXT.no_key });
    expect(await mapInvokeError(httpError(412, envelope('bad_key', 'x')))).toEqual({ ok: false, code: 'bad_key', message: AI_FIX_TEXT.bad_key });
  });
  it('keeps the function message and extras for other codes', async () => {
    expect(await mapInvokeError(httpError(422, envelope('refused', 'The model declined this request.', { category: 'cyber' }))))
      .toEqual({ ok: false, code: 'refused', message: 'The model declined this request.', category: 'cyber' });
    expect(await mapInvokeError(httpError(429, envelope('rate_limited', 'Wait.')))).toMatchObject({ code: 'rate_limited', message: 'Wait.' });
  });
  it('a 404 that is not the envelope means not deployed', async () => {
    expect(await mapInvokeError(httpError(404, { code: 'NOT_FOUND', message: 'Requested function was not found' })))
      .toEqual({ ok: false, code: 'not_deployed', message: AI_FIX_TEXT.not_deployed });
    expect(await mapInvokeError(httpError(404, 'not json'))).toMatchObject({ code: 'not_deployed' });
  });
  it('unauthorized from the function means signed out', async () => {
    expect(await mapInvokeError(httpError(401, envelope('unauthorized', 'bad')))).toEqual({ ok: false, code: 'signed_out', message: AI_FIX_TEXT.signed_out });
  });
  it('another status without the envelope is error', async () => {
    expect(await mapInvokeError(httpError(500, 'boom'))).toMatchObject({ code: 'error', message: expect.stringContaining('500') });
  });
  it('a fetch error is network', async () => {
    expect(await mapInvokeError({ name: 'FunctionsFetchError', message: 'Failed to send a request' })).toEqual({ ok: false, code: 'network', message: NETWORK_TEXT });
  });
  it('a relay error or anything else is error with its message', async () => {
    expect(await mapInvokeError({ name: 'FunctionsRelayError', message: 'Relay Error invoking the Edge Function' })).toEqual({ ok: false, code: 'error', message: 'Relay Error invoking the Edge Function' });
    expect(await mapInvokeError(null)).toMatchObject({ code: 'error' });
  });
  it('the demo client error means demo', async () => {
    expect(await mapInvokeError({ name: 'DemoFunctionsError', code: 'demo', message: 'x' })).toEqual({ ok: false, code: 'demo', message: AI_FIX_TEXT.demo });
  });
  it('fix commands exist for the states that have one', () => {
    expect(AI_FIX_TEXT.no_key).toContain(AI_FIX_COMMAND.no_key);
    expect(AI_FIX_TEXT.not_deployed).toContain(AI_FIX_COMMAND.not_deployed);
  });
});

describe('demo mode', () => {
  it('every call answers demo without touching the client', async () => {
    const s = stubClient();
    const ai = createAi({ client: s.client, isDemo: true });
    expect(await ai.aiStatus()).toEqual({ ok: false, state: 'demo', message: AI_FIX_TEXT.demo });
    const demo = { ok: false, code: 'demo', message: AI_FIX_TEXT.demo };
    expect(await ai.analyzeAd('x')).toEqual(demo);
    expect(await ai.classifyAds()).toEqual(demo);
    expect(await ai.buildBrief({ hooks: ['h'] })).toEqual(demo);
    expect(await ai.countUnclassified()).toEqual(demo);
    expect(ai.classifyInBackground(['a'])).toBeUndefined();
    expect(s.invoke).not.toHaveBeenCalled();
    expect(s.from).not.toHaveBeenCalled();
    expect(s.client.auth.getSession).not.toHaveBeenCalled();
  });
});

describe('signed out', () => {
  it('answers signed_out without invoking', async () => {
    const s = stubClient({ session: null });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.aiStatus()).toEqual({ ok: false, state: 'signed_out', message: AI_FIX_TEXT.signed_out });
    expect(await ai.analyzeAd('x')).toEqual({ ok: false, code: 'signed_out', message: AI_FIX_TEXT.signed_out });
    expect(s.invoke).not.toHaveBeenCalled();
  });
  it('a session read that throws counts as signed out', async () => {
    const s = stubClient();
    s.client.auth.getSession = async () => { throw new Error('down'); };
    const ai = createAi({ client: s.client, isDemo: false });
    expect((await ai.analyzeAd('x')).code).toBe('signed_out');
  });
});

describe('aiStatus', () => {
  it('ready when ok and ready', async () => {
    const s = stubClient({ answers: READY });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.aiStatus()).toEqual({ ok: true, state: 'ready', message: 'AI ready: claude-sonnet-5-5, up to 20 ads per tagging run', model: 'claude-sonnet-5-5', batchLimit: 20 });
    expect(s.invoke).toHaveBeenCalledWith('ai', { body: { action: 'status' } });
  });
  it('no_key when ok but not ready', async () => {
    const s = stubClient({ answers: () => ({ data: { ok: true, ready: false, model: 'm', batchLimit: 5 }, error: null }) });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.aiStatus()).toEqual({ ok: false, state: 'no_key', message: AI_FIX_TEXT.no_key, model: 'm', batchLimit: 5 });
  });
  it('maps failures to states', async () => {
    const cases = [
      [{ data: null, error: httpError(404, 'nope') }, 'not_deployed'],
      [{ data: null, error: { name: 'FunctionsFetchError', message: 'x' } }, 'network'],
      [{ data: null, error: { name: 'FunctionsRelayError', message: 'relay' } }, 'error'],
      [{ data: null, error: httpError(500, envelope('misconfigured', 'SUPABASE_URL missing')) }, 'error'],
      [{ data: 'garbage', error: null }, 'error'],
    ];
    for (const [answer, state] of cases) {
      const ai = createAi({ client: stubClient({ answers: () => answer }).client, isDemo: false });
      expect((await ai.aiStatus()).state).toBe(state);
    }
  });
  it('a thrown invoke is network', async () => {
    const s = stubClient();
    s.client.functions.invoke = async () => { throw new Error('offline'); };
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.aiStatus()).toEqual({ ok: false, state: 'network', message: NETWORK_TEXT });
  });
  it('is cached for five minutes unless forced', async () => {
    let t = 1_000_000;
    const s = stubClient({ answers: READY });
    const ai = createAi({ client: s.client, isDemo: false, now: () => t });
    await ai.aiStatus();
    t += STATUS_TTL_MS - 1;
    await ai.aiStatus();
    expect(s.invoke).toHaveBeenCalledTimes(1);
    await ai.aiStatus({ force: true });
    expect(s.invoke).toHaveBeenCalledTimes(2);
    t += STATUS_TTL_MS;
    await ai.aiStatus();
    expect(s.invoke).toHaveBeenCalledTimes(3);
  });
  it('works with fake timers too', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-29T10:00:00Z'));
      const s = stubClient({ answers: READY });
      const ai = createAi({ client: s.client, isDemo: false });
      await ai.aiStatus();
      vi.advanceTimersByTime(4 * 60 * 1000);
      await ai.aiStatus();
      expect(s.invoke).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60 * 1000 + 1);
      await ai.aiStatus();
      expect(s.invoke).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('signed out and network answers are not cached', async () => {
    let answer = { data: null, error: { name: 'FunctionsFetchError', message: 'x' } };
    const s = stubClient({ answers: () => answer });
    const ai = createAi({ client: s.client, isDemo: false });
    expect((await ai.aiStatus()).state).toBe('network');
    answer = READY('status');
    expect((await ai.aiStatus()).state).toBe('ready');
  });
  it('two calls at once share one request', async () => {
    const s = stubClient({ answers: READY });
    const ai = createAi({ client: s.client, isDemo: false });
    await Promise.all([ai.aiStatus(), ai.aiStatus()]);
    expect(s.invoke).toHaveBeenCalledTimes(1);
  });
  it('an action that answers no_key drops the cached ready', async () => {
    let status = READY('status');
    const s = stubClient({ answers: (action) => (action === 'status' ? status : { data: null, error: httpError(412, envelope('no_key', 'x')) }) });
    const ai = createAi({ client: s.client, isDemo: false });
    await ai.aiStatus();
    expect(ai.cachedStatus().state).toBe('ready');
    await ai.analyzeAd('00000000-0000-4000-8000-000000000001');
    expect(ai.cachedStatus()).toBeNull();
  });
});

describe('actions', () => {
  it('analyzeAd sends the id and returns analysis and ad', async () => {
    const s = stubClient({ answers: () => ({ data: { ok: true, analysis: { hook: 'h' }, ad: { id: 'a' } }, error: null }) });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.analyzeAd('a')).toEqual({ ok: true, analysis: { hook: 'h' }, ad: { id: 'a' } });
    expect(s.invoke).toHaveBeenCalledWith('ai', { body: { action: 'analyze', adId: 'a' } });
  });
  it('analyzeAd failure carries code, message and extras', async () => {
    const s = stubClient({ answers: () => ({ data: null, error: httpError(422, envelope('refused', 'Declined.', { category: 'bio' })) }) });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.analyzeAd('a')).toEqual({ ok: false, code: 'refused', message: 'Declined.', category: 'bio' });
  });
  it('classifyAds passes only what was given', async () => {
    const s = stubClient({ answers: READY });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.classifyAds()).toEqual({ ok: true, classified: 1, remaining: 0, capped: false, limit: 20 });
    expect(s.invoke).toHaveBeenLastCalledWith('ai', { body: { action: 'classify' } });
    await ai.classifyAds({ adIds: ['a'], limit: 5 });
    expect(s.invoke).toHaveBeenLastCalledWith('ai', { body: { action: 'classify', adIds: ['a'], limit: 5 } });
  });
  it('buildBrief sends lists, title and notes, and returns the brief', async () => {
    const s = stubClient({ answers: () => ({ data: { ok: true, brief: { id: 'b' } }, error: null }) });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.buildBrief({ adIds: ['a'], hooks: ['h'], title: 't', notes: 'n' })).toEqual({ ok: true, brief: { id: 'b' } });
    expect(s.invoke).toHaveBeenCalledWith('ai', { body: { action: 'brief', adIds: ['a'], hooks: ['h'], title: 't', notes: 'n' } });
    await ai.buildBrief();
    expect(s.invoke).toHaveBeenLastCalledWith('ai', { body: { action: 'brief', adIds: [], hooks: [] } });
  });
  it('a 200 without ok true is an error, never a throw', async () => {
    const s = stubClient({ answers: () => ({ data: { ok: false, error: { code: 'bad_request', message: 'Ad not found.' } }, error: null }) });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.analyzeAd('a')).toEqual({ ok: false, code: 'bad_request', message: 'Ad not found.' });
  });
  it('countUnclassified counts ads without an angle', async () => {
    const s = stubClient({ count: 143 });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.countUnclassified()).toEqual({ ok: true, count: 143 });
    expect(s.from).toHaveBeenCalledWith('ads');
    expect(s.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(s.is).toHaveBeenCalledWith('metrics->>angle', null);
  });
  it('countUnclassified reports an error', async () => {
    const s = stubClient({ countError: { message: 'permission denied' } });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(await ai.countUnclassified()).toEqual({ ok: false, code: 'error', message: 'permission denied' });
  });
});

const ids = (n, from = 0) => Array.from({ length: n }, (_, i) => `id-${from + i}`);

describe('classifyInBackground', () => {
  async function readyAi(opts = {}) {
    const s = stubClient({ answers: READY });
    const debug = vi.fn();
    const ai = createAi({ client: s.client, isDemo: false, debug, ...opts });
    await ai.aiStatus();
    s.invoke.mockClear();
    return { ai, s, debug };
  }

  it('does nothing until the cached status is ready', async () => {
    const s = stubClient({ answers: READY });
    const ai = createAi({ client: s.client, isDemo: false });
    expect(ai.classifyInBackground(['a'])).toBeUndefined();
    expect(s.invoke).not.toHaveBeenCalled();
  });
  it('does nothing when the status is no_key', async () => {
    const s = stubClient({ answers: () => ({ data: { ok: true, ready: false, model: 'm', batchLimit: 20 }, error: null }) });
    const ai = createAi({ client: s.client, isDemo: false });
    await ai.aiStatus();
    s.invoke.mockClear();
    expect(ai.classifyInBackground(['a'])).toBeUndefined();
    expect(s.invoke).not.toHaveBeenCalled();
  });
  it('sends at most 20 ids per call', async () => {
    const { ai, s } = await readyAi();
    await ai.classifyInBackground(ids(45));
    expect(s.invoke).toHaveBeenCalledTimes(1);
    expect(s.invoke.mock.calls[0][1].body).toEqual({ action: 'classify', adIds: ids(BACKGROUND_PER_CALL) });
  });
  it('stops at 100 per page load', async () => {
    const { ai, s } = await readyAi();
    for (let k = 0; k < 6; k++) await ai.classifyInBackground(ids(20, k * 20));
    expect(s.invoke).toHaveBeenCalledTimes(5);
    const sent = s.invoke.mock.calls.flatMap((c) => c[1].body.adIds);
    expect(sent).toHaveLength(BACKGROUND_PER_LOAD);
  });
  it('the last call is trimmed to what is left of the budget', async () => {
    const { ai, s } = await readyAi();
    for (let k = 0; k < 5; k++) await ai.classifyInBackground(ids(19, k * 19));
    await ai.classifyInBackground(ids(20, 500));
    expect(s.invoke.mock.calls.at(-1)[1].body.adIds).toHaveLength(5);
  });
  it('dedupes and ignores junk ids', async () => {
    const { ai, s } = await readyAi();
    await ai.classifyInBackground(['a', 'a', '', null, 7, 'b']);
    expect(s.invoke.mock.calls[0][1].body.adIds).toEqual(['a', 'b']);
    expect(ai.classifyInBackground([])).toBeUndefined();
    expect(ai.classifyInBackground('a')).toBeUndefined();
  });
  it('VITE_AI_AUTO=0 turns it off', async () => {
    const { ai, s } = await readyAi({ auto: '0' });
    expect(ai.classifyInBackground(['a'])).toBeUndefined();
    expect(s.invoke).not.toHaveBeenCalled();
  });
  it('any other VITE_AI_AUTO value leaves it on', async () => {
    for (const auto of [undefined, '', '1', 'yes']) {
      const { ai, s } = await readyAi({ auto });
      await ai.classifyInBackground(['a']);
      expect(s.invoke).toHaveBeenCalledTimes(1);
    }
  });
  it('failures go to debug only and never throw', async () => {
    const { ai, s, debug } = await readyAi();
    s.client.functions.invoke = vi.fn(async () => ({ data: null, error: httpError(429, envelope('rate_limited', 'Wait.')) }));
    const r = await ai.classifyInBackground(['a']);
    expect(r).toMatchObject({ ok: false, code: 'rate_limited' });
    expect(debug).toHaveBeenCalled();
  });
  it('the status goes stale after five minutes and background stops', async () => {
    let t = 0;
    const { ai, s } = await readyAi({ now: () => t });
    t = STATUS_TTL_MS + 1;
    expect(ai.classifyInBackground(['a'])).toBeUndefined();
    expect(s.invoke).not.toHaveBeenCalled();
  });
});
