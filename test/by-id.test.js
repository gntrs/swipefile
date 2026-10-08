import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { byId } from '../src/lib/byId.js';
import { createDemoClient } from '../src/lib/demo/client.js';
import { demoId } from '../src/lib/demo/constants.js';

const ID = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';
// Never sent: the builders are only read, not awaited.
const live = createClient('https://example.supabase.co', 'anon-key', { auth: { persistSession: false } });
const addr = (b) => `${b.url.pathname}?${b.url.searchParams.toString()}`;
// What ad blocker lists match on: the path followed by `?id=`.
const blocked = (b) => /\/ads\?id=/.test(addr(b));

describe('byId on the real supabase-js builder', () => {
  it('shows the problem it fixes: update().eq() asks for /ads?id=', () => {
    expect(blocked(live.from('ads').update({ verdict: 'winner' }).eq('id', ID))).toBe(true);
    expect(blocked(live.from('ads').delete().in('id', [ID]))).toBe(true);
  });

  it('puts select first for an update of one id', () => {
    const b = byId(live.from('ads').update({ verdict: 'winner' }), ID);
    expect(b.method).toBe('PATCH');
    expect(blocked(b)).toBe(false);
    expect(addr(b)).toBe(`/rest/v1/ads?select=id&id=eq.${ID}`);
  });

  it('puts select first for a delete of many ids', () => {
    const b = byId(live.from('ads').delete(), [ID, ID2]);
    expect(b.method).toBe('DELETE');
    expect(blocked(b)).toBe(false);
    expect(b.url.searchParams.get('select')).toBe('id');
    expect(b.url.searchParams.get('id')).toBe(`in.(${ID},${ID2})`);
  });

  it('keeps the update body as given', () => {
    const b = byId(live.from('ads').update({ verdict: 'loser', metrics: { a: 1 } }), ID);
    expect(b.body).toEqual({ verdict: 'loser', metrics: { a: 1 } });
  });

  it('works on any table, not only ads', () => {
    expect(addr(byId(live.from('briefs').update({ title: 'x' }), ID))).toBe(`/rest/v1/briefs?select=id&id=eq.${ID}`);
  });

  it('an empty list asks for no rows rather than every row', () => {
    const b = byId(live.from('ads').delete(), []);
    expect(b.url.searchParams.get('id')).toBe('in.()');
  });
});

describe('byId on the demo client', () => {
  it('updates one ad and returns its id', async () => {
    const demo = createDemoClient();
    const id = demoId('ads', 1);
    const r = await byId(demo.from('ads').update({ verdict: 'loser' }), id);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ id }]);
    const { data } = await demo.from('ads').select('verdict').eq('id', id).single();
    expect(data.verdict).toBe('loser');
  });

  it('deletes only the listed ads', async () => {
    const demo = createDemoClient();
    const { data: before } = await demo.from('ads').select('id');
    const gone = [demoId('ads', 1), demoId('ads', 2)];
    const r = await byId(demo.from('ads').delete(), gone);
    expect(r.error).toBeNull();
    const { data: after } = await demo.from('ads').select('id');
    expect(after.length).toBe(before.length - 2);
    expect(after.map((a) => a.id)).not.toContain(gone[0]);
  });

  it('an unknown id changes nothing and is not an error', async () => {
    const demo = createDemoClient();
    const r = await byId(demo.from('ads').update({ verdict: 'loser' }), '00000000-0000-4000-8000-0000000fffff');
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
  });
});

describe('no ads update or delete in src builds /ads?id= any more', () => {
  const SRC = fileURLToPath(new URL('../src', import.meta.url));
  const files = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(js|jsx)$/.test(f) ? [p] : [];
    });
  it('every from(\'ads\').update/delete goes through byId', () => {
    const offenders = [];
    for (const f of files(SRC)) {
      if (f.includes(join('lib', 'demo')) || f.endsWith(join('lib', 'byId.js'))) continue;
      const src = readFileSync(f, 'utf8');
      const re = /from\('ads'\)\s*\.(update|delete)\([^)]*\)\s*\.(eq|in|match)\('id'/g;
      if (re.test(src)) offenders.push(f.slice(SRC.length));
    }
    expect(offenders).toEqual([]);
  });
});
