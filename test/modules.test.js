import { describe, it, expect, vi } from 'vitest';
import { parseModules, isTeamMode, MODULE_IDS, DEFAULT_MODULES, FEATURE_READY } from '../src/lib/modules.js';

const sorted = (set) => [...set].sort();

describe('parseModules', () => {
  it('falls back to the solo default when unset or empty', () => {
    expect(sorted(parseModules(undefined))).toEqual([...DEFAULT_MODULES].sort());
    expect(sorted(parseModules(''))).toEqual([...DEFAULT_MODULES].sort());
    expect(sorted(parseModules('   '))).toEqual([...DEFAULT_MODULES].sort());
    expect(sorted(parseModules(null))).toEqual([...DEFAULT_MODULES].sort());
  });

  it('keeps team and ops out of the default', () => {
    const set = parseModules(undefined);
    expect(set.has('team')).toBe(false);
    expect(set.has('ops')).toBe(false);
  });

  it('turns everything on with all, in any case', () => {
    expect(sorted(parseModules('all'))).toEqual([...MODULE_IDS].sort());
    expect(sorted(parseModules('ALL'))).toEqual([...MODULE_IDS].sort());
    expect(sorted(parseModules(' All '))).toEqual([...MODULE_IDS].sort());
    expect(sorted(parseModules('library,all'))).toEqual([...MODULE_IDS].sort());
  });

  it('trims and lowercases a comma list', () => {
    expect(sorted(parseModules(' Hooks , BRIEFS,, '))).toEqual(['briefs', 'hooks', 'library']);
  });

  it('always includes library', () => {
    expect(sorted(parseModules('hooks'))).toEqual(['hooks', 'library']);
    expect(sorted(parseModules('library'))).toEqual(['library']);
  });

  it('keeps library when only team is asked for', () => {
    expect(sorted(parseModules('team'))).toEqual(['library', 'team']);
  });

  it('drops unknown ids and warns once in the browser', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', {});
    try {
      expect(sorted(parseModules('hooks,chat,nope'))).toEqual(['hooks', 'library']);
      parseModules('other');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('chat, nope');
  });

  it('uses the default when every id is unknown', () => {
    expect(sorted(parseModules('chat,crm'))).toEqual([...DEFAULT_MODULES].sort());
  });

  it('ignores non string input', () => {
    expect(sorted(parseModules(42))).toEqual([...DEFAULT_MODULES].sort());
    expect(sorted(parseModules(['team']))).toEqual([...DEFAULT_MODULES].sort());
  });

  it('returns a new set every call', () => {
    const a = parseModules('');
    a.add('team');
    expect(parseModules('').has('team')).toBe(false);
  });
});

describe('isTeamMode', () => {
  it('is off for the default and on with team or ops', () => {
    expect(isTeamMode(parseModules(''))).toBe(false);
    expect(isTeamMode(parseModules('team'))).toBe(true);
    expect(isTeamMode(parseModules('ops'))).toBe(true);
    expect(isTeamMode(parseModules('library,team'))).toBe(true);
    expect(isTeamMode(parseModules('all'))).toBe(true);
    expect(isTeamMode(parseModules('hooks,briefs,competitors,intel'))).toBe(false);
  });
});

describe('FEATURE_READY', () => {
  it('capture is built and shown', () => {
    expect(FEATURE_READY).toEqual({ capture: true });
  });
});
