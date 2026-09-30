import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PAGE_SIZE, sfNum, sfPos, rpcParams, applyFilters, sortAds, queryAds, computeFacets, loadPage, loadFacets,
  invalidateLocalCache, isMissingFunction,
} from '../../src/lib/library/query.js';
import { DEFAULT_FILTERS } from '../../src/lib/library/filters.js';

// 80 fictional ads covering every edge of the search rules. The same file
// feeds the SQL parity check, which proved search_ads() returns these orders.
const FX = JSON.parse(readFileSync(new URL('./fixtures/ads.json', import.meta.url), 'utf8'));
const OWN = { ownBrand: 'Oakline' };
const ids = (rows) => rows.map((a) => a.id);
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const isRecent = (a) => Array.isArray(a.tags) && a.tags.includes('recently-added');

describe('sfNum and sfPos (the SQL sf_num and sf_pos)', () => {
  it('reads JSON numbers and plain decimal strings only', () => {
    expect(sfNum(45)).toBe(45);
    expect(sfNum('45')).toBe(45);
    expect(sfNum(' 31 ')).toBe(31);
    expect(sfNum('12.5')).toBe(12.5);
    expect(sfNum('.5')).toBe(0.5);
    expect(sfNum('5.')).toBe(5);
    expect(sfNum('-3')).toBe(-3);
    expect(sfNum('1e3')).toBe(1000);
    for (const v of ['0x40', '+40', 'abc', '', ' ', 'Infinity', 'NaN', true, false, null, undefined, [5], { a: 1 }, NaN, Infinity]) {
      expect(sfNum(v), String(v)).toBe(null);
    }
  });
  it('sfPos keeps only numbers above zero', () => {
    expect(sfPos('3.25')).toBe(3.25);
    expect(sfPos(0)).toBe(null);
    expect(sfPos(-2)).toBe(null);
    expect(sfPos('n/a')).toBe(null);
  });
});

describe('the local twin on the fixture', () => {
  it('first five ids of every sort', () => {
    const first5 = (sort) => ids(queryAds(FX, { sort }, OWN).slice(0, 5));
    expect(first5('newest')).toEqual([U(1), U(9), U(17), `a${U(25).slice(1)}`, U(33)]);
    expect(first5('longest')).toEqual([U(41), U(73), U(33), U(9), U(1)]);
    expect(first5('impressions')).toEqual([U(1), U(9), `a${U(25).slice(1)}`, U(17), U(41)]);
    expect(first5('roas')).toEqual([U(1), `f${U(49).slice(1)}`, U(57), `a${U(25).slice(1)}`, U(33)]);
    expect(first5('ctr')).toEqual([U(9), U(17), `f${U(49).slice(1)}`, U(73), U(1)]);
    expect(first5('cpc')).toEqual([`f${U(49).slice(1)}`, U(33), `a${U(25).slice(1)}`, U(57), U(1)]);
    expect(first5('spend')).toEqual([`f${U(49).slice(1)}`, U(57), `a${U(25).slice(1)}`, U(41), U(73)]);
  });
  it('every sort: recent first, then the key in order with missing values last, ties by created_at then id', () => {
    const key = {
      longest: (a) => (typeof a.metrics?.days_running === 'number' ? a.metrics.days_running : null),
      impressions: (a) => sfPos(a.metrics?.impressions) ?? sfPos(a.metrics?.reach),
      roas: (a) => sfPos(a.metrics?.roas),
      ctr: (a) => sfPos(a.metrics?.ctr),
      spend: (a) => sfPos(a.metrics?.spend),
      cpc: (a) => sfPos(a.metrics?.cpc),
      newest: () => null,
    };
    for (const [sort, get] of Object.entries(key)) {
      for (const filters of [{}, { who: 'rivals' }, { verdict: 'winner' }]) {
        const rows = queryAds(FX, { ...filters, sort }, OWN);
        for (let i = 1; i < rows.length; i++) {
          const a = rows[i - 1];
          const b = rows[i];
          const where = `${sort} ${JSON.stringify(filters)} at ${i}`;
          if (isRecent(a) !== isRecent(b)) {
            expect(isRecent(a), where).toBe(true);
            continue;
          }
          const ka = get(a);
          const kb = get(b);
          if (ka !== kb) {
            if (ka === null) throw new Error(`${where}: a missing value before a present one`);
            if (kb === null) continue;
            if (sort === 'cpc') expect(ka < kb, where).toBe(true);
            else expect(ka > kb, where).toBe(true);
            continue;
          }
          const ta = Date.parse(a.created_at);
          const tb = Date.parse(b.created_at);
          expect(ta >= tb, where).toBe(true);
          if (ta === tb) expect(a.id > b.id, where).toBe(true);
        }
      }
    }
  });
  it('recent rows come first even with a filter and a sort active', () => {
    const rows = queryAds(FX, { who: 'rivals', sort: 'cpc' }, OWN);
    const firstOld = rows.findIndex((a) => !isRecent(a));
    expect(firstOld).toBeGreaterThan(0);
    expect(rows.slice(firstOld).some(isRecent)).toBe(false);
  });
  it('q searches brand, hook, copy, platform and tag text', () => {
    const rows = queryAds(FX, { q: '  EVERGREEN-tag ' });
    expect(rows.length).toBe(14);
    for (const a of rows) expect(a.tags).toContain('evergreen-tag');
    expect(queryAds(FX, { q: 'free ship' }).length).toBeGreaterThan(0);
    expect(queryAds(FX, { q: 'zzz no match' })).toEqual([]);
    // no wildcards
    expect(queryAds(FX, { q: 'fixture%hook' })).toEqual([]);
  });
  it('who with and without an own brand', () => {
    const ours = queryAds(FX, { who: 'ours' }, OWN);
    expect(ours.length).toBe(32);
    for (const a of ours) expect(a.brand.trim().toLowerCase()).toBe('oakline');
    expect(queryAds(FX, { who: 'rivals' }, OWN).length).toBe(48);
    expect(queryAds(FX, { who: 'ours' }, { ownBrand: '' })).toEqual([]);
    expect(queryAds(FX, { who: 'rivals' }, { ownBrand: '' }).length).toBe(80);
    expect(queryAds(FX, { who: 'ours' }, { ownBrand: '  OAKLINE ' }).length).toBe(32);
  });
  it('angle none means null or missing, never an unknown angle', () => {
    const rows = queryAds(FX, { angle: 'none' });
    expect(rows.length).toBe(25);
    for (const a of rows) expect(a.metrics?.angle ?? null).toBe(null);
    expect(queryAds(FX, { angle: 'pain' }).every((a) => a.metrics.angle === 'pain')).toBe(true);
  });
  it('starred is only the JSON boolean true; proven counts numeric strings', () => {
    expect(applyFilters(FX, { starred: true }).every((a) => a.metrics.starred === true)).toBe(true);
    expect(applyFilters([{ id: 'x', metrics: { starred: 'true' } }], { starred: true })).toEqual([]);
    const p = (m, verdict = 'unsure') => applyFilters([{ id: 'x', verdict, metrics: m }], { proven: true }).length;
    expect(p({ days_running: '45' })).toBe(1);
    expect(p({ days_running: 30 })).toBe(1);
    expect(p({ days_running: 29 })).toBe(0);
    expect(p({ days_running: '0x40' })).toBe(0);
    expect(p({ days_running: true })).toBe(0);
    expect(p({}, 'winner')).toBe(1);
    expect(p(null)).toBe(0);
  });
  it('country and tag filters', () => {
    const es = queryAds(FX, { country: 'es' });
    expect(es.length).toBeGreaterThan(0);
    for (const a of es) expect(a.countries.map((c) => c.trim().toUpperCase())).toContain('ES');
    expect(queryAds(FX, { tag: 'B' }).every((a) => a.tags.includes('B'))).toBe(true);
    expect(queryAds(FX, { tag: 'b' }).every((a) => a.tags.includes('b'))).toBe(true);
  });
  it('sortAds does not change its input', () => {
    const copy = JSON.parse(JSON.stringify(FX));
    sortAds(copy, 'roas');
    expect(copy).toEqual(FX);
    expect(sortAds(null)).toEqual([]);
    expect(applyFilters(undefined, {})).toEqual([]);
  });
  it('facets: counts and orders like library_facets()', () => {
    const f = computeFacets(FX);
    expect(Object.keys(f)).toEqual(['total', 'proven', 'starred', 'recent', 'geo_checked', 'countries', 'tags', 'angles']);
    expect(f.total).toBe(80);
    expect(f.tags.some((t) => t.tag === 'recently-added' || t.tag === '')).toBe(false);
    expect(f.tags.map((t) => t.tag)).toContain('B');
    const counts = f.countries.map((c) => c.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(computeFacets([])).toEqual({ total: 0, proven: 0, starred: 0, recent: 0, geo_checked: 0, countries: [], tags: [], angles: [] });
  });
});

describe('rpcParams', () => {
  it('trims q, sends real booleans and the lowercased own brand', () => {
    expect(rpcParams({ q: '  Hi ', starred: 1, proven: 0 }, { ownBrand: ' Oakline ' })).toEqual({
      q: 'Hi', verdict: 'all', who: 'all', proven: false, starred: true, recent: false, country: 'all', geo: 'all',
      angle: 'all', tag: '', sort: 'newest', own_brand: 'oakline',
    });
    expect(rpcParams({}, { ownBrand: '' }).own_brand).toBe('');
    expect(rpcParams(undefined, { ownBrand: null }).q).toBe('');
  });
});

// ---- loadPage and loadFacets with stub clients ----------------------------

function rpcStub(handler) {
  const calls = [];
  const client = {
    calls,
    rpc(name, args, opts) {
      const call = { name, args, opts, range: null };
      calls.push(call);
      const p = {
        range(from, to) {
          call.range = [from, to];
          return p;
        },
        then(resolve, reject) {
          return Promise.resolve().then(() => handler(call)).then(resolve, reject);
        },
      };
      return p;
    },
    fromCalls: 0,
    from(table) {
      client.fromCalls++;
      const q = {
        select: () => q,
        order: () => q,
        range: async (from, to) => ({ data: (client.rows || []).slice(from, to + 1), error: null }),
      };
      return q;
    },
  };
  return client;
}

const rowsFor = (n) => Array.from({ length: n }, (_, i) => ({ id: U(i + 1), created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(), tags: [], metrics: {} }));

describe('loadPage', () => {
  beforeEach(() => invalidateLocalCache());

  it('rpc ok: sends p and the range, returns the count', async () => {
    const client = rpcStub((call) => ({ data: rowsFor(3), error: null, count: 100, status: 206 }));
    const r = await loadPage({ ...DEFAULT_FILTERS, page: 2, verdict: 'winner' }, { client, ownBrand: 'X' });
    expect(client.calls[0]).toMatchObject({ name: 'search_ads', opts: { count: 'exact' }, range: [48, 95] });
    expect(client.calls[0].args.p).toMatchObject({ verdict: 'winner', own_brand: 'x' });
    expect(r).toEqual({ rows: rowsFor(3), total: 100, page: 2, pages: 3, mode: 'rpc', error: null });
  });

  it('rpc missing (PGRST202) falls back to local, loads the table once and caches it', async () => {
    const client = rpcStub(() => ({ data: null, error: { code: 'PGRST202', message: 'missing' }, status: 404 }));
    client.rows = rowsFor(130);
    const r1 = await loadPage({ page: 1 }, { client, ownBrand: '' });
    expect(r1.mode).toBe('local');
    expect(r1.total).toBe(130);
    expect(r1.pages).toBe(3);
    expect(r1.rows).toHaveLength(PAGE_SIZE);
    expect(r1.rows[0].id).toBe(U(130)); // newest first
    const r3 = await loadPage({ page: 3 }, { client, ownBrand: '' });
    expect(r3.rows).toHaveLength(130 - 96);
    expect(client.fromCalls).toBe(1); // cached
    invalidateLocalCache();
    await loadPage({ page: 1 }, { client, ownBrand: '' });
    expect(client.fromCalls).toBe(2);
  });

  it('42883 and a bare 404 also count as missing', async () => {
    expect(isMissingFunction({ error: { code: '42883' } })).toBe(true);
    expect(isMissingFunction({ error: { message: 'x' }, status: 404 })).toBe(true);
    expect(isMissingFunction({ error: { code: 'XX000' }, status: 500 })).toBe(false);
    expect(isMissingFunction({ data: [], status: 404 })).toBe(false);
  });

  it('local: a page past the end clamps to the last page', async () => {
    const client = rpcStub(() => ({ data: null, error: { code: '42883', message: 'missing' } }));
    client.rows = rowsFor(50);
    const r = await loadPage({ page: 9 }, { client, ownBrand: '' });
    expect(r).toMatchObject({ page: 2, pages: 2, total: 50 });
    expect(r.rows).toHaveLength(2);
  });

  it('rpc: a page past the end clamps to the last page', async () => {
    const client = rpcStub((call) => {
      if (call.range[0] >= 96) return { data: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' }, status: 416 };
      return { data: rowsFor(call.range[0] === 0 ? 48 : 2), error: null, count: 50 };
    });
    const r = await loadPage({ page: 5 }, { client, ownBrand: '' });
    expect(r).toMatchObject({ page: 2, pages: 2, total: 50, mode: 'rpc', error: null });
    expect(r.rows).toHaveLength(2);
  });

  it('rpc: an empty result on page 1 is simply empty', async () => {
    const client = rpcStub(() => ({ data: [], error: null, count: 0 }));
    expect(await loadPage({}, { client })).toEqual({ rows: [], total: 0, page: 1, pages: 1, mode: 'rpc', error: null });
  });

  it('rpc other error: returns the error and no rows, never falls back', async () => {
    const client = rpcStub(() => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' }, status: 500 }));
    const r = await loadPage({}, { client });
    expect(r).toMatchObject({ rows: [], mode: 'rpc', error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    expect(client.fromCalls).toBe(0);
  });

  it('a throwing client never throws out of loadPage', async () => {
    const client = { rpc() { throw new Error('offline'); } };
    const r = await loadPage({}, { client });
    expect(r.error.message).toBe('offline');
    expect(r.rows).toEqual([]);
  });

  it('local: a partial table load is reported and not cached', async () => {
    const client = rpcStub(() => ({ data: null, error: { code: 'PGRST202' } }));
    let fail = true;
    client.from = () => {
      client.fromCalls++;
      const q = { select: () => q, order: () => q, range: async () => (fail ? { data: null, error: { message: 'boom' } } : { data: rowsFor(3), error: null }) };
      return q;
    };
    const r = await loadPage({}, { client, ownBrand: '' });
    expect(r.error).toMatchObject({ message: 'boom' });
    expect(r.partial).toBe(true);
    fail = false;
    const r2 = await loadPage({}, { client, ownBrand: '' });
    expect(r2.error).toBe(null);
    expect(r2.total).toBe(3);
  }, 10000);
});

describe('loadFacets', () => {
  beforeEach(() => invalidateLocalCache());
  it('rpc ok', async () => {
    const facets = { total: 5 };
    const client = rpcStub(() => ({ data: facets, error: null }));
    expect(await loadFacets({ client })).toEqual({ facets, mode: 'rpc', error: null });
  });
  it('missing function: computed from the local cache', async () => {
    const client = rpcStub(() => ({ data: null, error: { code: 'PGRST202' } }));
    client.rows = rowsFor(4);
    const r = await loadFacets({ client });
    expect(r.mode).toBe('local');
    expect(r.facets.total).toBe(4);
  });
  it('another error: empty facets and the error', async () => {
    const client = rpcStub(() => ({ data: null, error: { code: '500', message: 'down' } }));
    const r = await loadFacets({ client });
    expect(r.error).toEqual({ code: '500', message: 'down' });
    expect(r.facets.total).toBe(0);
  });
});
