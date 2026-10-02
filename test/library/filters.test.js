import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS, SORTS, filtersFromParams, paramsFromFilters, isFiltered, clearFilters, withFilter,
} from '../../src/lib/library/filters.js';

const P = (s) => new URLSearchParams(s);
const from = (s) => filtersFromParams(P(s));

describe('filtersFromParams', () => {
  it('empty or missing params give the defaults', () => {
    expect(from('')).toEqual(DEFAULT_FILTERS);
    expect(filtersFromParams(null)).toEqual(DEFAULT_FILTERS);
    expect(filtersFromParams(undefined)).toEqual(DEFAULT_FILTERS);
  });
  it('keeps the deep links that exist today', () => {
    expect(from('starred=1')).toEqual({ ...DEFAULT_FILTERS, starred: true });
    expect(from('proven=1')).toEqual({ ...DEFAULT_FILTERS, proven: true });
    expect(from('q=Brand')).toEqual({ ...DEFAULT_FILTERS, q: 'Brand' });
    expect(from('who=rivals')).toEqual({ ...DEFAULT_FILTERS, who: 'rivals' });
  });
  it('reads every key', () => {
    expect(
      from('q=%20offer%20&verdict=winner&who=ours&proven=1&starred=true&recent=1&country=es&geo=eu&angle=pain&tag=ugc&sort=roas&page=3')
    ).toEqual({
      q: ' offer ', verdict: 'winner', who: 'ours', proven: true, starred: true, recent: true,
      country: 'ES', geo: 'eu', angle: 'pain', tag: 'ugc', sort: 'roas', page: 3,
    });
  });
  it('junk in every key falls back to the default', () => {
    const junk = {
      q: 'x'.repeat(201), verdict: 'great', who: 'them', proven: 'yes', starred: '0', recent: '',
      country: 'ESP', geo: 'mars', angle: 'banana', tag: 't'.repeat(61), sort: 'random', page: '0',
    };
    expect(filtersFromParams(P(junk))).toEqual(DEFAULT_FILTERS);
    for (const page of ['-1', '1.5', 'abc', '10001', '99999999', '']) expect(from(`page=${page}`).page).toBe(1);
    expect(from('page=10000').page).toBe(10000);
    expect(from('country=1A').country).toBe('all');
    expect(from('angle=none').angle).toBe('none');
    expect(from('angle=all').angle).toBe('all');
    expect(from('tag=%20%20').tag).toBe('');
    expect(from(`q=${'x'.repeat(200)}`).q).toHaveLength(200);
  });
});

describe('paramsFromFilters', () => {
  it('writes nothing for the defaults', () => {
    expect(paramsFromFilters(DEFAULT_FILTERS).toString()).toBe('');
    expect(paramsFromFilters({}).toString()).toBe('');
  });
  it('writes non default values only, in DEFAULT_FILTERS order, booleans as 1', () => {
    const f = { ...DEFAULT_FILTERS, page: 2, sort: 'cpc', starred: true, q: 'hi there', country: 'fr' };
    expect(paramsFromFilters(f).toString()).toBe('q=hi+there&starred=1&country=FR&sort=cpc&page=2');
  });
  it('page 1 is never written', () => {
    expect(paramsFromFilters({ ...DEFAULT_FILTERS, page: 1, verdict: 'loser' }).toString()).toBe('verdict=loser');
  });
  it('drops invalid values instead of writing them', () => {
    expect(paramsFromFilters({ verdict: 'great', sort: 'nope', page: -4, who: 'x' }).toString()).toBe('');
  });
  it('round trips every key', () => {
    const cases = [
      { q: 'Brand' }, { verdict: 'testing' }, { who: 'ours' }, { proven: true }, { starred: true }, { recent: true },
      { country: 'DE' }, { geo: 'none' }, { angle: 'none' }, { angle: 'how_to' }, { tag: 'ugc' },
      ...SORTS.map((s) => ({ sort: s.id })), { page: 7 },
    ];
    for (const c of cases) {
      const f = { ...DEFAULT_FILTERS, ...c };
      expect(filtersFromParams(paramsFromFilters(f))).toEqual(f);
    }
  });
});

describe('isFiltered, clearFilters, withFilter', () => {
  it('sort and page do not count as filters', () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, sort: 'roas', page: 4 })).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, q: '   ' })).toBe(false);
  });
  it('sees who (Rivals then Clear filters must bring everything back)', () => {
    expect(isFiltered({ ...DEFAULT_FILTERS, who: 'rivals' })).toBe(true);
    expect(isFiltered(clearFilters({ ...DEFAULT_FILTERS, who: 'rivals' }))).toBe(false);
  });
  it('sees every other key', () => {
    for (const [k, v] of Object.entries({ q: 'x', verdict: 'winner', proven: true, starred: true, recent: true, country: 'ES', geo: 'eu', angle: 'none', tag: 'ugc' })) {
      expect(isFiltered({ ...DEFAULT_FILTERS, [k]: v }), k).toBe(true);
    }
  });
  it('clearFilters keeps the sort and resets the rest', () => {
    const f = { ...DEFAULT_FILTERS, who: 'rivals', verdict: 'winner', sort: 'longest', page: 5, q: 'x' };
    expect(clearFilters(f)).toEqual({ ...DEFAULT_FILTERS, sort: 'longest' });
    expect(clearFilters({ sort: 'bogus' }).sort).toBe('newest');
  });
  it('withFilter goes back to page 1 unless the page itself changes', () => {
    const f = { ...DEFAULT_FILTERS, page: 4 };
    expect(withFilter(f, 'verdict', 'loser')).toEqual({ ...DEFAULT_FILTERS, verdict: 'loser', page: 1 });
    expect(withFilter(f, 'page', 5).page).toBe(5);
    expect(withFilter(f, 'sort', 'roas').page).toBe(1);
    expect(f.page).toBe(4);
  });
});
