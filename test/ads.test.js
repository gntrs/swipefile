import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scoreVerdict,
  isAutoVerdict,
  nextImportVerdict,
  humanVerdictPatch,
  VERDICTS,
  STATUSES,
  adCountries,
  isProven,
  euReach,
  creativeLink,
  parseCountryList,
  compareMarkets,
} from '../src/lib/ads.js';

const NOW = new Date('2026-09-29T10:00:00Z');
const DAY = 86400000;
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();
const own = (m) => ({ metrics: m });
const rival = (m) => ({ metrics: { last_synced: ago(1), ...m } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('scoreVerdict: own ads (money beats duration)', () => {
  it('needs 25 spent before it reads anything', () => {
    expect(scoreVerdict(own({ spend: 24.99, roas: 3 })).verdict).toBe('testing');
    expect(scoreVerdict(own({ spend: 25, roas: 1.5 })).verdict).toBe('winner');
  });
  it('ROAS 1.5 is the winner line', () => {
    expect(scoreVerdict(own({ spend: 25, roas: 1.49 })).verdict).toBe('testing');
  });
  it('a bad ROAS is only a loser with 50 spent', () => {
    expect(scoreVerdict(own({ spend: 49.99, roas: 0.79 })).verdict).toBe('testing');
    expect(scoreVerdict(own({ spend: 50, roas: 0.79 })).verdict).toBe('loser');
  });
  it('falls back to CTR without revenue data', () => {
    expect(scoreVerdict(own({ spend: 100, ctr: 5 })).verdict).toBe('winner');
    expect(scoreVerdict(own({ spend: 100, ctr: 4.99 })).verdict).toBe('testing');
    expect(scoreVerdict(own({ spend: 100, ctr: 1.5 })).verdict).toBe('testing');
    expect(scoreVerdict(own({ spend: 100, ctr: 1.49 })).verdict).toBe('loser');
    expect(scoreVerdict(own({ spend: 100 })).verdict).toBe('unsure');
  });
  it('explains itself', () => {
    expect(scoreVerdict(own({ spend: 25, roas: 1.5 })).reason).toMatch(/ROAS 1\.50/);
  });
});

describe('scoreVerdict: competitor ads (duration, liveness, freshness)', () => {
  it('no run length is unsure', () => {
    expect(scoreVerdict(rival({})).verdict).toBe('unsure');
    expect(scoreVerdict({}).verdict).toBe('unsure');
    expect(scoreVerdict(null).verdict).toBe('unsure');
  });
  it('evidence older than 45 days is stale', () => {
    expect(scoreVerdict(rival({ days_running: 90, live: true, last_synced: ago(46) })).verdict).toBe('unsure');
    expect(scoreVerdict(rival({ days_running: 90, live: true, last_synced: ago(45) })).verdict).toBe('winner');
  });
  it('live 60 days is a winner, 59 is still testing', () => {
    expect(scoreVerdict(rival({ days_running: 60, live: true })).verdict).toBe('winner');
    expect(scoreVerdict(rival({ days_running: 59, live: true })).verdict).toBe('testing');
  });
  it('a 90 day run that ended within 180 days is a winner', () => {
    expect(scoreVerdict(rival({ days_running: 90, live: false, started_running: ago(90 + 180) })).verdict).toBe('winner');
    expect(scoreVerdict(rival({ days_running: 90, live: false, started_running: ago(90 + 181) })).verdict).toBe('unsure');
  });
  it('killed before 21 days is a loser', () => {
    expect(scoreVerdict(rival({ days_running: 21, live: false })).verdict).toBe('unsure');
    expect(scoreVerdict(rival({ days_running: 20, live: false })).verdict).toBe('loser');
  });
  it('uses the status column when live is unknown', () => {
    expect(scoreVerdict({ status: 'running', metrics: { days_running: 70, last_synced: ago(1) } }).verdict).toBe('winner');
  });
});

describe('isAutoVerdict and nextImportVerdict (E08)', () => {
  const importer = (extra = {}) => ({ added_by_email: 'adlib@import', verdict: 'testing', metrics: { auto_verdict: 'testing' }, ...extra });

  it('advances an importer row whose verdict still equals the auto one', () => {
    expect(isAutoVerdict(importer())).toBe(true);
    expect(nextImportVerdict(importer(), 'winner')).toBe('winner');
  });
  it('leaves a verdict a person changed', () => {
    const changed = importer({ verdict: 'loser' });
    expect(isAutoVerdict(changed)).toBe(false);
    expect(nextImportVerdict(changed, 'winner')).toBe(null);
  });
  it('leaves a verdict marked human even when it equals the auto one', () => {
    const marked = importer({ metrics: { auto_verdict: 'testing', verdict_by: 'human' } });
    expect(isAutoVerdict(marked)).toBe(false);
    expect(nextImportVerdict(marked, 'winner')).toBe(null);
  });
  it('leaves a row a person added, even if its verdict is still unsure', () => {
    const handAdded = { added_by_email: 'someone@example.com', verdict: 'unsure', metrics: {} };
    expect(isAutoVerdict(handAdded)).toBe(false);
    expect(nextImportVerdict(handAdded, 'winner')).toBe(null);
  });
  it('advances an importer default row with no auto verdict yet', () => {
    const fresh = { added_by_email: 'adlib@import', verdict: 'unsure', metrics: {} };
    expect(isAutoVerdict(fresh)).toBe(true);
    expect(nextImportVerdict(fresh, 'loser')).toBe('loser');
  });
  it('returns null when there is no new auto verdict', () => {
    expect(nextImportVerdict(importer(), null)).toBe(null);
    expect(nextImportVerdict(importer(), undefined)).toBe(null);
    expect(nextImportVerdict(importer(), '')).toBe(null);
  });
  it('handles a missing row safely', () => {
    expect(isAutoVerdict(null)).toBe(false);
    expect(nextImportVerdict(null, 'winner')).toBe(null);
  });
});

describe('humanVerdictPatch', () => {
  it('sets the verdict and marks it human, keeping other metrics', () => {
    const ad = { verdict: 'unsure', metrics: { starred: true, auto_verdict: 'unsure', days_running: 12 } };
    const patch = humanVerdictPatch(ad, 'winner', NOW);
    expect(patch).toEqual({
      verdict: 'winner',
      metrics: { starred: true, auto_verdict: 'unsure', days_running: 12, verdict_by: 'human', verdict_at: NOW.toISOString() },
    });
    expect(ad.metrics.verdict_by).toBeUndefined(); // pure
  });
  it('works on an ad without metrics', () => {
    expect(humanVerdictPatch({}, 'loser', NOW).metrics).toEqual({ verdict_by: 'human', verdict_at: NOW.toISOString() });
    expect(humanVerdictPatch(null, 'loser', NOW).verdict).toBe('loser');
  });
  it('throws on a verdict that does not exist', () => {
    expect(() => humanVerdictPatch({}, 'great')).toThrow();
    expect(() => humanVerdictPatch({}, undefined)).toThrow();
  });
  it('the patched ad is no longer auto', () => {
    const ad = { added_by_email: 'adlib@import', verdict: 'testing', metrics: { auto_verdict: 'testing' } };
    const after = { ...ad, ...humanVerdictPatch(ad, 'testing', NOW) };
    expect(isAutoVerdict(after)).toBe(false);
  });
  it('lists the allowed values', () => {
    expect(VERDICTS).toEqual(['unsure', 'winner', 'testing', 'loser']);
    expect(STATUSES).toEqual(['running', 'dead', 'saved']);
  });
});

describe('adCountries', () => {
  it('dedupes, uppercases and trims', () => {
    expect(adCountries({ countries: ['es', ' ES', 'fr ', 'FR', ''] })).toEqual(['ES', 'FR']);
  });
  it('prefers the column over metrics', () => {
    expect(adCountries({ countries: ['DE'], metrics: { countries: ['IT'] } })).toEqual(['DE']);
  });
  it('falls back to metrics when the column is not an array', () => {
    expect(adCountries({ countries: null, metrics: { countries: ['it'] } })).toEqual(['IT']);
  });
  it('is empty when nothing is known', () => {
    expect(adCountries({})).toEqual([]);
    expect(adCountries(null)).toEqual([]);
  });
});

describe('isProven, euReach, creativeLink', () => {
  it('proven means winner or 30+ days running', () => {
    expect(isProven({ verdict: 'winner' })).toBe(true);
    expect(isProven({ verdict: 'testing', metrics: { days_running: 30 } })).toBe(true);
    expect(isProven({ verdict: 'testing', metrics: { days_running: 29 } })).toBe(false);
    expect(isProven(null)).toBe(false);
  });
  it('euReach reads the column, then metrics, and ignores zero and junk', () => {
    expect(euReach({ eu_reach: 1200 })).toBe(1200);
    expect(euReach({ metrics: { eu_reach: '800' } })).toBe(800);
    expect(euReach({ eu_reach: 0 })).toBe(null);
    expect(euReach({ eu_reach: 'x' })).toBe(null);
    expect(euReach({})).toBe(null);
  });
  it('creativeLink prefers a saved link, else a keyword search', () => {
    expect(creativeLink({ metrics: { source_url: 'https://example.com/ad' } })).toBe('https://example.com/ad');
    const url = creativeLink({ brand: 'Kettle & Kite' });
    expect(url).toContain('https://www.facebook.com/ads/library/');
    expect(url).toContain(`q=${encodeURIComponent('Kettle & Kite')}`);
    expect(creativeLink({ hook: 'Only a hook' })).toContain(encodeURIComponent('Only a hook'));
  });
});

describe('focus countries', () => {
  it('parses a comma list', () => {
    expect(parseCountryList(' es, FR ,,es')).toEqual(['ES', 'FR']);
    expect(parseCountryList('')).toEqual([]);
    expect(parseCountryList(undefined)).toEqual([]);
  });
  it('orders focus markets first, then alphabetically', () => {
    const focus = ['FR', 'ES'];
    expect(['US', 'ES', 'DE', 'FR'].sort((a, b) => compareMarkets(a, b, focus))).toEqual(['FR', 'ES', 'DE', 'US']);
    expect(['US', 'DE', 'GB'].sort((a, b) => compareMarkets(a, b, []))).toEqual(['DE', 'GB', 'US']);
  });
});
