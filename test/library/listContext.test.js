import { describe, it, expect } from 'vitest';
import { saveListContext, readListContext, neighbours, LIST_MAX_AGE_MS } from '../../src/lib/library/listContext.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

describe('list context', () => {
  it('saves and reads back ids and search under sf:list', () => {
    const storage = memory();
    expect(saveListContext({ ids: ['a', 'b', 'c'], search: '?verdict=winner' }, { storage, now: 1000 })).toBe(true);
    expect(JSON.parse(storage.map.get('sf:list'))).toEqual({ ids: ['a', 'b', 'c'], search: '?verdict=winner', at: 1000 });
    expect(readListContext({ storage, now: 2000 })).toEqual({ ids: ['a', 'b', 'c'], search: '?verdict=winner', at: 1000 });
  });
  it('blocked, missing or broken storage never throws', () => {
    expect(saveListContext({ ids: ['a'] }, { storage: broken })).toBe(false);
    expect(readListContext({ storage: broken })).toBe(null);
    expect(saveListContext({ ids: ['a'] }, { storage: null })).toBe(false);
    expect(readListContext({ storage: null })).toBe(null);
    const storage = memory();
    expect(readListContext({ storage })).toBe(null);
    storage.setItem('sf:list', '{not json');
    expect(readListContext({ storage })).toBe(null);
    storage.setItem('sf:list', JSON.stringify({ ids: 'a,b', at: 1 }));
    expect(readListContext({ storage, now: 1 })).toBe(null);
  });
  it('a stale list is ignored', () => {
    const storage = memory();
    saveListContext({ ids: ['a'] }, { storage, now: 0 });
    expect(readListContext({ storage, now: LIST_MAX_AGE_MS })).not.toBe(null);
    expect(readListContext({ storage, now: LIST_MAX_AGE_MS + 1 })).toBe(null);
  });
  it('drops junk ids and a search that is not a query string', () => {
    const storage = memory();
    storage.setItem('sf:list', JSON.stringify({ ids: ['a', 3, null, '', 'b'], search: 'https://evil.example', at: 5 }));
    expect(readListContext({ storage, now: 5 })).toEqual({ ids: ['a', 'b'], search: '', at: 5 });
    saveListContext({ ids: 'nope', search: 7 }, { storage, now: 6 });
    expect(readListContext({ storage, now: 6 })).toEqual({ ids: [], search: '', at: 6 });
  });
});

describe('neighbours', () => {
  const ctx = { ids: ['a', 'b', 'c'], search: '?q=x' };
  it('middle, first and last', () => {
    expect(neighbours('b', ctx)).toEqual({ prev: 'a', next: 'c', index: 1, search: '?q=x' });
    expect(neighbours('a', ctx)).toEqual({ prev: null, next: 'b', index: 0, search: '?q=x' });
    expect(neighbours('c', ctx)).toEqual({ prev: 'b', next: null, index: 2, search: '?q=x' });
  });
  it('an ad not on the page, or no list at all', () => {
    expect(neighbours('z', ctx)).toEqual({ prev: null, next: null, index: -1, search: '?q=x' });
    expect(neighbours('a', null)).toEqual({ prev: null, next: null, index: -1, search: '' });
  });
});
