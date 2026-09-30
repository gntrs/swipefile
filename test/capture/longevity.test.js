import { describe, it, expect } from 'vitest';
import {
  parseArgs, optedIn, longevityPatch, checkOrder, pauseMs, DEFAULT_LIMIT, TERMS_MESSAGE,
} from '../../scripts/lib/longevity.mjs';

const NOW = new Date('2026-09-29T10:00:00Z');

describe('parseArgs', () => {
  it('defaults', () => {
    expect(parseArgs([])).toEqual({
      ok: true,
      opts: { acceptTerms: false, fixture: null, id: null, limit: DEFAULT_LIMIT, dryRun: false, rescore: false, help: false },
    });
  });
  it('reads every flag', () => {
    expect(parseArgs(['--i-accept-the-terms', '--limit', '5', '--dry-run', '--rescore']).opts).toMatchObject({
      acceptTerms: true, limit: 5, dryRun: true, rescore: true,
    });
    expect(parseArgs(['--fixture', 'a.html', '--id', '999900007654321']).opts).toMatchObject({ fixture: 'a.html', id: '999900007654321' });
    expect(parseArgs(['-h']).opts.help).toBe(true);
  });
  it.each([
    [['--limit'], 'needs a value'],
    [['--limit', '0'], 'whole number'],
    [['--limit', '1001'], 'whole number'],
    [['--limit', '2.5'], 'whole number'],
    [['--limit', 'ten'], 'whole number'],
    [['--id', '12'], '6 to 20 digits'],
    [['--fixture', 'a.html'], 'needs --id'],
    [['--id', '999900007654321'], 'only works with --fixture'],
    [['--fixture', '--id', '999900007654321'], 'needs a value'],
    [['--fixture', 'a.html', '--id', '999900007654321', '--rescore'], 'nothing is written'],
    [['--apply'], 'Unknown option --apply'],
  ])('refuses %j', (argv, message) => {
    const r = parseArgs(argv);
    expect(r.ok).toBe(false);
    expect(r.error).toContain(message);
  });
});

describe('optedIn', () => {
  it('only the flag or LONGEVITY_OPT_IN=1', () => {
    expect(optedIn([], {})).toBe(false);
    expect(optedIn(['--dry-run'], { LONGEVITY_OPT_IN: '0' })).toBe(false);
    expect(optedIn([], { LONGEVITY_OPT_IN: 'yes' })).toBe(false);
    expect(optedIn(['--i-accept-the-terms'], {})).toBe(true);
    expect(optedIn([], { LONGEVITY_OPT_IN: '1' })).toBe(true);
    expect(optedIn([], { LONGEVITY_OPT_IN: ' 1 ' })).toBe(true);
    expect(optedIn(undefined, undefined)).toBe(false);
  });
  it('the terms message says how to opt in', () => {
    expect(TERMS_MESSAGE).toContain('--i-accept-the-terms');
    expect(TERMS_MESSAGE).toContain('LONGEVITY_OPT_IN=1');
  });
});

describe('longevityPatch', () => {
  const ad = {
    id: 'a', verdict: 'winner', status: 'running',
    metrics: { ad_library_id: '999900002345678', started_running: '2025-11-02T00:00:00.000Z', live: true, days_running: 10, spend: 5, verdict_by: 'human' },
  };

  it('an ad that stopped: live false, stopped date, days to the stop, status dead', () => {
    const p = longevityPatch(ad, { libraryId: '999900002345678', active: false, started: '2025-11-02', stopped: '2025-12-14' }, NOW);
    expect(p).toEqual({
      status: 'dead',
      metrics: {
        ...ad.metrics,
        live: false,
        stopped_running: '2025-12-14',
        days_running: 42,
        last_synced: NOW.toISOString(),
        longevity_checked_at: NOW.toISOString(),
      },
    });
  });

  it('an ad still running: days to now, no stopped date, status running', () => {
    const p = longevityPatch({ ...ad, status: 'dead', metrics: { ...ad.metrics, live: false, stopped_running: '2025-12-01' } }, { active: true, started: '2025-11-02' }, NOW);
    expect(p.status).toBe('running');
    expect(p.metrics.live).toBe(true);
    expect(p.metrics.stopped_running).toBeUndefined();
    expect(p.metrics.days_running).toBe(331);
  });

  it('never touches the verdict or other metrics', () => {
    const p = longevityPatch(ad, { active: false, stopped: '2025-12-14' }, NOW);
    expect(p.verdict).toBeUndefined();
    expect(p.metrics.verdict_by).toBe('human');
    expect(p.metrics.spend).toBe(5);
  });

  it('an inactive ad with no stop date keeps its old day count', () => {
    const p = longevityPatch(ad, { active: false }, NOW);
    expect(p.metrics.days_running).toBe(10);
    expect(p.status).toBe('dead');
  });

  it('unknown activity keeps the status and live flag', () => {
    const p = longevityPatch({ status: 'saved', metrics: {} }, { started: '2026-09-01' }, NOW);
    expect(p.status).toBe('saved');
    expect(p.metrics.live).toBeUndefined();
    expect(p.metrics.started_running).toBe('2026-09-01T00:00:00.000Z');
    expect(p.metrics.days_running).toBe(28);
  });

  it('works with a missing ad or capture and does not mutate its input', () => {
    const copy = JSON.parse(JSON.stringify(ad));
    longevityPatch(ad, { active: false, stopped: '2026-01-01' }, NOW);
    expect(ad).toEqual(copy);
    expect(longevityPatch(null, null, NOW)).toEqual({
      status: 'running',
      metrics: { last_synced: NOW.toISOString(), longevity_checked_at: NOW.toISOString() },
    });
  });
});

describe('checkOrder and pauseMs', () => {
  it('never checked first, then oldest check first, ties stay in order', () => {
    const ads = [
      { id: 'new', metrics: { longevity_checked_at: '2026-09-20T00:00:00Z' } },
      { id: 'never1', metrics: {} },
      { id: 'old', metrics: { longevity_checked_at: '2026-01-01T00:00:00Z' } },
      { id: 'never2', metrics: { longevity_checked_at: 'garbage' } },
      { id: 'nometrics' },
    ];
    expect(checkOrder(ads).map((a) => a.id)).toEqual(['never1', 'never2', 'nometrics', 'old', 'new']);
  });
  it('pauses 3 to 6 seconds', () => {
    expect(pauseMs(() => 0)).toBe(3000);
    expect(pauseMs(() => 0.9999)).toBe(5999);
  });
});
