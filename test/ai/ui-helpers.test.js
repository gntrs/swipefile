import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { shortDate } from '../../src/features/ai/dates.js';
import { sourceIdsOf, sourceLabel, briefAuthor, firstLines, checkDraft, sourceCountText, AI_AUTHOR } from '../../src/features/ai/briefs.js';
import { briefBlocker, MAX_BRIEF_ADS, MAX_BRIEF_HOOKS } from '../../src/features/ai/BriefFromSelection.jsx';
import { classifyLabels } from '../../src/features/ai/ClassifyHooksButton.jsx';
import { aiSetupCheck } from '../../src/features/ai/AiSetupRow.jsx';
import { statusProblem } from '../../src/features/ai/AiNotice.jsx';
import { extractPrompt } from '../../src/pages/Briefs.jsx';
import { AI_FIX_TEXT, AI_FIX_COMMAND } from '../../src/lib/ai.js';

describe('shortDate', () => {
  it('formats the same in every locale', () => {
    expect(shortDate('2026-09-29T10:00:00Z')).toBe('29 Sep 2026');
    expect(shortDate('2026-01-05T12:00:00Z')).toBe('5 Jan 2026');
  });
  it('is null for missing or bad input', () => {
    for (const v of [null, undefined, '', 'nope']) expect(shortDate(v)).toBeNull();
  });
});

describe('brief helpers', () => {
  it('sourceIdsOf collects each id once, skipping junk', () => {
    expect(sourceIdsOf([{ source_ad_ids: ['a', 'b'] }, { source_ad_ids: ['b', '', null] }, {}, null, { source_ad_ids: 'x' }])).toEqual(['a', 'b']);
    expect(sourceIdsOf()).toEqual([]);
  });
  it('sourceLabel', () => {
    expect(sourceLabel({ brand: 'Oats', hook: 'Hi' })).toBe('Oats: Hi');
    expect(sourceLabel({ brand: 'Oats', hook: null })).toBe('Oats');
    expect(sourceLabel({})).toBe('Untitled ad');
    expect(sourceLabel(null)).toBe('Deleted ad');
    const long = sourceLabel({ brand: 'B', hook: 'x'.repeat(100) });
    expect(long.length).toBe(60);
    expect(long.endsWith('...')).toBe(true);
  });
  it('briefAuthor: solo shows AI for generated briefs and nothing else', () => {
    expect(briefAuthor({ added_by_email: AI_AUTHOR }, { teamMode: false })).toBe('AI');
    expect(briefAuthor({ added_by_email: 'me@example.com' }, { teamMode: false })).toBe('');
  });
  it('briefAuthor: team mode prefers who asked, through displayName', () => {
    const displayName = (e) => `name:${e}`;
    expect(briefAuthor({ added_by_email: AI_AUTHOR, requested_by_email: 'a@x.com' }, { teamMode: true, displayName })).toBe('name:a@x.com');
    expect(briefAuthor({ added_by_email: 'b@x.com' }, { teamMode: true, displayName })).toBe('name:b@x.com');
    expect(briefAuthor({}, { teamMode: true, displayName })).toBe('');
    expect(briefAuthor(null)).toBe('');
  });
  it('firstLines skips blank lines', () => {
    expect(firstLines('a\n\n b\nc\nd', 3)).toBe('a\n b\nc');
    expect(firstLines(null)).toBe('');
  });
  it('checkDraft', () => {
    expect(checkDraft({ title: ' T ', body: ' B ' })).toEqual({ ok: true, title: 'T', body: 'B' });
    expect(checkDraft({ title: '', body: '' }).message).toBe('Give the brief a title and a body.');
    expect(checkDraft({ title: 'T', body: '  ' }).message).toBe('The brief needs a body.');
    expect(checkDraft({ title: '', body: 'B' }).message).toBe('Give the brief a title.');
    expect(checkDraft({ title: 'x'.repeat(201), body: 'B' }).ok).toBe(false);
    expect(checkDraft().ok).toBe(false);
  });
  it('sourceCountText', () => {
    expect(sourceCountText({ source_ad_ids: ['a', 'b', 'c'] })).toBe('3 source ads');
    expect(sourceCountText({ source_ad_ids: ['a'] })).toBe('1 source ad');
    expect(sourceCountText({ source_ad_ids: [] })).toBeNull();
    expect(sourceCountText({})).toBeNull();
  });
  it('extractPrompt still works', () => {
    expect(extractPrompt('x\n>>> AI EDITOR PROMPT\nDo it\n<<< END PROMPT\ny')).toBe('Do it');
    expect(extractPrompt('no prompt')).toBeNull();
  });
});

describe('briefBlocker', () => {
  it('blocks an empty selection and the caps, not the limits themselves', () => {
    expect(briefBlocker([], [])).toBe('Select ads or hooks first.');
    expect(briefBlocker([], ['  '])).toBe('Select ads or hooks first.');
    expect(briefBlocker(Array(MAX_BRIEF_ADS).fill('a'), [])).toBeNull();
    expect(briefBlocker(Array(21).fill('a'), [])).toBe('A brief takes up to 20 ads. 21 are selected.');
    expect(briefBlocker([], Array(MAX_BRIEF_HOOKS).fill('h'))).toBeNull();
    expect(briefBlocker([], Array(51).fill('h'))).toBe('A brief takes up to 50 hooks. 51 are selected.');
    expect(briefBlocker(undefined, undefined)).toBe('Select ads or hooks first.');
  });
});

describe('classifyLabels', () => {
  it('not ready: plain label, no note', () => {
    expect(classifyLabels({ ready: false })).toEqual({ label: 'Tag angles', note: null });
  });
  it('ready: the count and the batch size', () => {
    expect(classifyLabels({ ready: true, count: 143, batchLimit: 20 })).toEqual({ label: 'Tag angles (143)', note: 'Tags up to 20 hooks per press, one AI call each time.' });
    expect(classifyLabels({ ready: true, count: 0, batchLimit: 20 })).toEqual({ label: 'Tag angles (0)', note: 'Every hook has an angle.' });
  });
  it('after a run: what was done and the next batch', () => {
    expect(classifyLabels({ ready: true, count: 123, batchLimit: 20, last: { classified: 20, remaining: 123, limit: 20 } }))
      .toEqual({ label: 'Tag next 20', note: 'Tagged 20. 123 left.' });
    expect(classifyLabels({ ready: true, count: 5, last: { classified: 20, remaining: 5, limit: 20 } }).label).toBe('Tag next 5');
    expect(classifyLabels({ ready: true, count: 0, last: { classified: 3, remaining: 0, limit: 20 } }))
      .toEqual({ label: 'Tag angles (0)', note: 'Tagged 3. Every hook has an angle.' });
  });
});

describe('aiSetupCheck', () => {
  it('ready is ok with the model and batch', () => {
    expect(aiSetupCheck({ state: 'ready', model: 'claude-sonnet-5-5', batchLimit: 20 })).toMatchObject({ level: 'ok', title: 'AI ready: claude-sonnet-5-5, up to 20 ads per tagging run' });
  });
  it('no_key warns with the secrets command', () => {
    expect(aiSetupCheck({ state: 'no_key' })).toMatchObject({ level: 'warn', title: 'ANTHROPIC_API_KEY is not set', fix: AI_FIX_COMMAND.no_key });
  });
  it('not_deployed is info with the deploy command', () => {
    expect(aiSetupCheck({ state: 'not_deployed' })).toMatchObject({ level: 'info', title: 'AI is optional and not deployed', fix: 'supabase functions deploy ai' });
  });
  it('demo, signed out, network, error', () => {
    expect(aiSetupCheck({ state: 'demo' })).toMatchObject({ level: 'info', detail: AI_FIX_TEXT.demo });
    expect(aiSetupCheck({ state: 'signed_out' })).toMatchObject({ level: 'info', title: 'Sign in to check AI.' });
    expect(aiSetupCheck({ state: 'network', message: 'Could not reach your Supabase project.' })).toMatchObject({ level: 'warn', detail: 'Could not reach your Supabase project.' });
    expect(aiSetupCheck({ state: 'error', message: 'boom' })).toMatchObject({ level: 'warn', detail: 'boom' });
    expect(aiSetupCheck(null)).toMatchObject({ level: 'info', title: 'Checking AI...' });
  });
});

describe('statusProblem', () => {
  it('turns a not ready status into a problem, ready into null', () => {
    expect(statusProblem({ state: 'no_key', message: 'm' })).toEqual({ code: 'no_key', message: 'm' });
    expect(statusProblem({ state: 'ready' })).toBeNull();
    expect(statusProblem(null)).toBeNull();
  });
});

describe('scripts/add-brief.mjs arguments', () => {
  const script = resolve(__dirname, '../../scripts/add-brief.mjs');
  // An empty folder as cwd, and no database variables, so nothing can connect.
  const cwd = mkdtempSync(join(tmpdir(), 'add-brief-'));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8', input: '' });

  it('needs a title', () => {
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Usage:');
  });
  it('refuses ids that are not uuids before looking at the env', () => {
    const r = run('--title', 'T', '--ads', '00000000-0000-4000-8000-000000000001,nope');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Not an id: nope');
    expect(r.stderr).not.toContain('Missing env');
  });
  it('refuses an empty --ads', () => {
    const r = run('--title', 'T', '--ads');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--ads takes a comma list');
  });
  it('good ids pass on to the env check', () => {
    const r = run('--title', 'T', '--ads', '00000000-0000-4000-8000-000000000001');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Missing env');
  });
});
