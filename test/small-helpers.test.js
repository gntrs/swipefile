import { describe, it, expect } from 'vitest';
import { libraryEmptyState, anyFilterActive } from '../src/lib/libraryState.js';
import { parseCompareIds, MAX_COMPARE } from '../src/lib/compare.js';
import { parseFunnelStages, DEFAULT_FUNNEL_STAGES } from '../src/lib/funnel.js';
import { parseArgs } from '../scripts/create-users-args.mjs';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('library empty states', () => {
  it('first run: no ads and nothing filtered', () => {
    expect(libraryEmptyState({ total: 0, shown: 0, filtersActive: false })).toBe('first-run');
  });
  it('no match: ads exist, or filters are on', () => {
    expect(libraryEmptyState({ total: 5, shown: 0, filtersActive: true })).toBe('no-match');
    expect(libraryEmptyState({ total: 0, shown: 0, filtersActive: true })).toBe('no-match');
    expect(libraryEmptyState({ total: 5, shown: 0, filtersActive: false })).toBe('no-match');
  });
  it('nothing when something is shown', () => {
    expect(libraryEmptyState({ total: 5, shown: 5 })).toBe(null);
  });
  it('counts Rivals (who) as a filter, so Clear filters shows up for it', () => {
    expect(anyFilterActive({})).toBe(false);
    expect(anyFilterActive({ who: 'rivals' })).toBe(true);
    expect(anyFilterActive({ who: 'all', q: '  ' })).toBe(false);
    expect(anyFilterActive({ q: 'x' })).toBe(true);
    expect(anyFilterActive({ verdict: 'winner' })).toBe(true);
    expect(anyFilterActive({ starredOnly: true })).toBe(true);
    expect(anyFilterActive({ country: 'ES' })).toBe(true);
    expect(anyFilterActive({ geo: 'eu' })).toBe(true);
  });
});

describe('parseCompareIds', () => {
  it('keeps up to four uuids in order and counts the rest', () => {
    const r = parseCompareIds([U(1), U(2), U(3), U(4), U(5), U(6)].join(','));
    expect(r.ids).toEqual([U(1), U(2), U(3), U(4)]);
    expect(r.dropped).toBe(2);
    expect(MAX_COMPARE).toBe(4);
  });
  it('reports non uuids as invalid without querying them', () => {
    const r = parseCompareIds(`${U(1)},abc,1;drop table,${U(2)}`);
    expect(r.ids).toEqual([U(1), U(2)]);
    expect(r.invalid).toEqual(['abc', '1;drop table']);
  });
  it('dedupes, trims and ignores empty parts', () => {
    expect(parseCompareIds(` ${U(1)} ,,${U(1).toUpperCase()}`).ids).toEqual([U(1)]);
    expect(parseCompareIds('')).toEqual({ ids: [], invalid: [], dropped: 0 });
    expect(parseCompareIds(null)).toEqual({ ids: [], invalid: [], dropped: 0 });
  });
});

describe('parseFunnelStages', () => {
  it('parses event:Label pairs in order', () => {
    expect(parseFunnelStages('a:First,b:Second')).toEqual([{ key: 'a', label: 'First' }, { key: 'b', label: 'Second' }]);
  });
  it('uses the event name when the label is missing and drops duplicates', () => {
    expect(parseFunnelStages('a,b:,a:Again')).toEqual([{ key: 'a', label: 'a' }, { key: 'b', label: 'b' }]);
  });
  it('falls back to the default six stages', () => {
    const d = parseFunnelStages('');
    expect(d).toHaveLength(6);
    expect(d[0]).toEqual({ key: 'landing_cta_clicked', label: 'Landing CTA' });
    expect(parseFunnelStages(' , ')).toEqual(parseFunnelStages(DEFAULT_FUNNEL_STAGES));
  });
});

describe('create-users arguments', () => {
  it('no arguments prints usage', () => {
    expect(parseArgs([])).toMatchObject({ usage: true });
  });
  it('a valid single account', () => {
    expect(parseArgs(['--email', 'a@b.c', '--password', 'abcdefgh'])).toEqual({
      mode: 'single', member: { email: 'a@b.c', role: 'member', password: 'abcdefgh' }, resetEmails: [],
    });
    expect(parseArgs(['--email=a@b.c', '--role', 'admin', '--nickname', ' Sam '])).toMatchObject({
      member: { email: 'a@b.c', role: 'admin', nickname: 'Sam' },
    });
  });
  it('no password means a generated one later', () => {
    expect(parseArgs(['--email', 'a@b.c']).member.password).toBeUndefined();
  });
  it('refuses bad input with one clear line', () => {
    expect(parseArgs(['--email', 'nope']).error).toMatch(/does not look like an email/);
    expect(parseArgs(['--email', 'a@b.c', '--password', 'short']).error).toMatch(/at least 8/);
    expect(parseArgs(['--email', 'a@b.c', '--role', 'boss']).error).toMatch(/admin or member/);
    expect(parseArgs(['users.json', '--email', 'a@b.c']).error).toMatch(/not both/);
    expect(parseArgs(['--email']).error).toMatch(/needs a value/);
    expect(parseArgs(['--email', '--password', 'x']).error).toMatch(/needs a value/);
    expect(parseArgs(['--wat']).error).toMatch(/Unknown option/);
    expect(parseArgs(['a.json', 'b.json']).error).toMatch(/One roster file/);
    expect(parseArgs(['users.json', '--role', 'admin']).error).toMatch(/only goes with --email/);
    expect(parseArgs(['--email', 'a@b.c', '--reset-pass', 'a@b.c']).error).toMatch(/only goes with a roster/);
  });
  it('roster mode with resets', () => {
    expect(parseArgs(['users.json', '--reset-pass', 'a@b.c', '--reset-pass', 'd@e.f'])).toEqual({
      mode: 'roster', rosterPath: 'users.json', resetEmails: ['a@b.c', 'd@e.f'],
    });
  });
});
