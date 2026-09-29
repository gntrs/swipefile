import { describe, it, expect } from 'vitest';
import * as ai from '../../src/lib/ai.js';

// The stub answers with the final shapes, so pages built against it keep
// working when the real client replaces it. The real client replaces this
// file together with src/lib/ai.js.
describe('ai client stub', () => {
  it('has the fix texts', () => {
    expect(Object.keys(ai.AI_FIX_TEXT).sort()).toEqual(['bad_key', 'demo', 'no_key', 'not_built', 'not_deployed', 'signed_out']);
  });
  it('aiStatus says not built', async () => {
    expect(await ai.aiStatus()).toEqual({ ok: false, state: 'not_built', message: ai.AI_FIX_TEXT.not_built });
    expect(await ai.aiStatus({ force: true })).toMatchObject({ ok: false, state: 'not_built' });
  });
  it('every action resolves not_built and never throws', async () => {
    const expected = { ok: false, code: 'not_built', message: ai.AI_FIX_TEXT.not_built };
    expect(await ai.analyzeAd('x')).toEqual(expected);
    expect(await ai.analyzeAd()).toEqual(expected);
    expect(await ai.classifyAds({ adIds: ['a'], limit: 5 })).toEqual(expected);
    expect(await ai.classifyAds()).toEqual(expected);
    expect(await ai.buildBrief({ adIds: ['a'], hooks: ['h'], title: 't', notes: 'n' })).toEqual(expected);
    expect(await ai.buildBrief()).toEqual(expected);
    expect(await ai.countUnclassified()).toEqual(expected);
  });
  it('classifyInBackground does nothing', () => {
    expect(ai.classifyInBackground(['a'])).toBeUndefined();
    expect(ai.classifyInBackground()).toBeUndefined();
  });
});
