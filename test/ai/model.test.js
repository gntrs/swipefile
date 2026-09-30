import { describe, it, expect, vi } from 'vitest';
import { callModel, sanitize } from '../../supabase/functions/ai/model.js';
import { ANALYSIS_SCHEMA, CLASSIFY_SCHEMA, BRIEF_SCHEMA, analyzePrompt, classifyPrompt, briefPrompt, hookLine } from '../../supabase/functions/ai/prompts.js';
import { ANGLE_IDS } from '../../supabase/functions/_shared/angles.js';

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const hasDash = (s) => s.includes(EM) || s.includes(EN);

describe('sanitize', () => {
  it('between digits becomes to', () => {
    expect(sanitize(`3${EN}5 days`)).toBe('3 to 5 days');
    expect(sanitize(`10 ${EM} 12`)).toBe('10 to 12');
  });
  it('with spaces around, or glued, becomes a comma', () => {
    expect(sanitize(`fast ${EM} and cheap`)).toBe('fast, and cheap');
    expect(sanitize(`fast${EN}cheap`)).toBe('fast, cheap');
  });
  it('a dash opening or ending a line is dropped, lines are kept', () => {
    expect(sanitize(`${EM} one\n  ${EN} two\nend ${EM}`)).toBe('one\n  two\nend');
  });
  it('collapses doubled commas and double spaces', () => {
    expect(sanitize(`a, ${EM} b`)).toBe('a, b');
    expect(sanitize('a  b   c')).toBe('a b c');
  });
  it('leaves text without dashes alone, hyphens included', () => {
    expect(sanitize('A well-known, plain line.')).toBe('A well-known, plain line.');
  });
  it('non strings become empty', () => {
    expect(sanitize(null)).toBe('');
    expect(sanitize(42)).toBe('');
  });
  it('never leaves a dash behind', () => {
    const noisy = `${EM}${EN}x${EM}${EM}y 1${EN}2${EN}3 ${EN}\n${EM}`;
    expect(hasDash(sanitize(noisy))).toBe(false);
  });
});

const client = (impl) => ({ messages: { create: vi.fn(impl) } });
const ARGS = { model: 'm', system: 's', content: [{ type: 'text', text: 't' }], schema: BRIEF_SCHEMA, effort: 'low', maxTokens: 100 };

describe('callModel', () => {
  it('sends the request shape, without thinking', async () => {
    const c = client(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"title":"a","body":"b"}' }] }));
    const r = await callModel(c, ARGS);
    expect(r).toEqual({ ok: true, data: { title: 'a', body: 'b' } });
    expect(c.messages.create).toHaveBeenCalledWith({
      model: 'm',
      max_tokens: 100,
      system: 's',
      messages: [{ role: 'user', content: ARGS.content }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: BRIEF_SCHEMA } },
    });
  });
  it('skips non text blocks to find the answer', async () => {
    const c = client(async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"x":1}' }] }));
    expect(await callModel(c, ARGS)).toEqual({ ok: true, data: { x: 1 } });
  });
  it('maps every failure', async () => {
    const cases = [
      [async () => ({ stop_reason: 'refusal', stop_details: { category: 'bio' }, content: [] }), { status: 422, code: 'refused', category: 'bio' }],
      [async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{' }] }), { status: 502, code: 'truncated' }],
      [async () => ({ stop_reason: 'end_turn', content: [] }), { status: 502, code: 'bad_output' }],
      [async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'nope' }] }), { status: 502, code: 'bad_output' }],
      [async () => { throw Object.assign(new Error('x'), { status: 401 }); }, { status: 412, code: 'bad_key' }],
      [async () => { throw Object.assign(new Error('x'), { status: 403 }); }, { status: 412, code: 'bad_key' }],
      [async () => { throw Object.assign(new Error('x'), { status: 404 }); }, { status: 502, code: 'upstream', message: 'Model m not found. Set AI_MODEL to a current model id.' }],
      [async () => { throw Object.assign(new Error('x'), { status: 429 }); }, { status: 429, code: 'rate_limited' }],
      [async () => { throw Object.assign(new Error('400 raw'), { status: 400, error: { error: { message: 'bad image' } } }); }, { status: 502, code: 'upstream', message: 'bad image', upstreamStatus: 400 }],
      [async () => { throw Object.assign(new Error('400 raw'), { status: 400 }); }, { status: 502, code: 'upstream', message: '400 raw' }],
      [async () => { throw Object.assign(new Error('x'), { status: 500 }); }, { status: 502, code: 'upstream' }],
      [async () => { throw new Error('Connection error.'); }, { status: 502, code: 'upstream' }],
      [async () => null, { status: 502, code: 'bad_output' }],
    ];
    for (const [impl, expected] of cases) {
      const r = await callModel(client(impl), ARGS);
      expect(r.ok).toBe(false);
      expect(r).toMatchObject(expected);
    }
  });
});

// Structured outputs accept only a subset of JSON schema; the length and
// count limits live in the handler.
function keysUsed(schema, out = new Set()) {
  if (schema && typeof schema === 'object') {
    for (const [k, v] of Object.entries(schema)) {
      if (k === 'properties') {
        for (const sub of Object.values(v)) keysUsed(sub, out);
        out.add(k);
      } else {
        out.add(k);
        if (k === 'items') keysUsed(v, out);
      }
    }
  }
  return out;
}

describe('schemas and prompts', () => {
  it('schemas use only the supported keywords', () => {
    const allowed = new Set(['type', 'properties', 'required', 'items', 'enum', 'additionalProperties']);
    for (const s of [ANALYSIS_SCHEMA, CLASSIFY_SCHEMA, BRIEF_SCHEMA]) {
      for (const k of keysUsed(s)) expect(allowed.has(k)).toBe(true);
    }
    expect(ANALYSIS_SCHEMA.properties.angle.enum).toEqual(ANGLE_IDS);
    expect(CLASSIFY_SCHEMA.properties.items.items.properties.angle.enum).toEqual(ANGLE_IDS);
  });
  it('hookLine prefers the headline, else the first copy line, cut to the limit', () => {
    expect(hookLine({ hook: ' Headline ', ad_copy: 'Copy' })).toBe('Headline');
    expect(hookLine({ hook: '', ad_copy: '\n\n First \nSecond' })).toBe('First');
    expect(hookLine({ hook: 'x'.repeat(300) })).toBe(`${'x'.repeat(200)}...`);
    expect(hookLine({})).toBe('');
  });
  it('the analyze prompt lists the ad and every angle with its hint', () => {
    const p = analyzePrompt({ brand: 'B', hook: 'H', format: 'image', metrics: { days_running: 12, live: true }, tags: ['a', 'b'] }, { imageAttached: true });
    expect(p.system).toMatch(/direct response creative strategist/);
    expect(p.text).toContain('Brand: B');
    expect(p.text).toContain('Days running: 12 days, still running');
    expect(p.text).toContain('Tags: a, b');
    expect(p.text).toContain('- social_proof: Social proof, reviews, customer counts, testimonials');
    expect(p.text).toContain('Landing page: not given');
  });
  it('the classify prompt numbers hooks on one line each', () => {
    const p = classifyPrompt(['one', 'two\nlines']);
    expect(p.text.endsWith('0: one\n1: two lines')).toBe(true);
  });
  it('the brief prompt carries notes, ads and hooks, and asks for the editor prompt markers', () => {
    const p = briefPrompt({ ads: [{ brand: 'B', hook: 'H', ad_copy: 'c'.repeat(900), verdict: 'winner', metrics: {} }], hooks: ['h1'], notes: 'more trials' });
    expect(p.system).toContain('>>> AI EDITOR PROMPT');
    expect(p.system).toContain('<<< END PROMPT');
    expect(p.text).toContain('Notes from the person asking: more trials');
    expect(p.text).toContain(`Copy: ${'c'.repeat(600)}...`);
    expect(p.text).toContain('- h1');
  });
  it('prompts carry no dash characters', () => {
    const all = [analyzePrompt({}, {}), classifyPrompt(['x']), briefPrompt({ hooks: ['x'] })].map((p) => p.system + p.text).join('');
    expect(hasDash(all)).toBe(false);
  });
});
