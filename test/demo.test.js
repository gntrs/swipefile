import { describe, it, expect, vi } from 'vitest';
import { createDemoClient } from '../src/lib/demo/client.js';
import { buildSeed, DEMO_BRANDS } from '../src/lib/demo/seed.js';
import { demoArtSvg, wrapText, escapeXml } from '../src/lib/demo/art.js';
import { DEMO_USER, DEMO_OWN_BRAND, demoId, AD_1, AD_2, POST_1 } from '../src/lib/demo/constants.js';
import { EXPECTED_SCHEMA_VERSION } from '../src/lib/setup/checks.js';
import { scoreVerdict } from '../src/lib/ads.js';

// A small, fixed store for the query tests.
const tiny = () => ({
  tables: {
    things: [
      { id: 'a', name: 'Alpha', n: 3, tags: ['x', 'y'], metrics: { days: 10, live: true, label: 'hot' }, created_at: '2026-01-03' },
      { id: 'b', name: 'beta', n: null, tags: ['y'], metrics: { days: 2, live: false }, created_at: '2026-01-02' },
      { id: 'c', name: 'Gamma', n: 1, tags: [], metrics: {}, created_at: '2026-01-01' },
    ],
  },
  art: {},
});
const client = () => createDemoClient({ seed: tiny });
const ids = (res) => (res.data || []).map((r) => r.id);

describe('demo client: reads', () => {
  it('selects everything, and honours a column list', async () => {
    const db = client();
    const all = await db.from('things').select('*');
    expect(all.error).toBe(null);
    expect(ids(all)).toEqual(['a', 'b', 'c']);
    const some = await db.from('things').select('id, name, nope');
    expect(some.data[0]).toEqual({ id: 'a', name: 'Alpha' });
  });

  it('returns copies, so callers cannot change the store', async () => {
    const db = client();
    const first = await db.from('things').select('*').eq('id', 'a').single();
    first.data.metrics.days = 999;
    const again = await db.from('things').select('*').eq('id', 'a').single();
    expect(again.data.metrics.days).toBe(10);
  });

  it('supports every filter', async () => {
    const db = client();
    expect(ids(await db.from('things').select().eq('name', 'Alpha'))).toEqual(['a']);
    expect(ids(await db.from('things').select().neq('name', 'Alpha'))).toEqual(['b', 'c']);
    expect(ids(await db.from('things').select().gt('n', 1))).toEqual(['a']);
    expect(ids(await db.from('things').select().gte('n', 1))).toEqual(['a', 'c']);
    expect(ids(await db.from('things').select().lt('n', 3))).toEqual(['c']);
    expect(ids(await db.from('things').select().lte('n', 3))).toEqual(['a', 'c']);
    expect(ids(await db.from('things').select().in('id', ['a', 'c', 'zz']))).toEqual(['a', 'c']);
    expect(ids(await db.from('things').select().is('n', null))).toEqual(['b']);
    expect(ids(await db.from('things').select().like('name', 'G%'))).toEqual(['c']);
    expect(ids(await db.from('things').select().like('name', 'g%'))).toEqual([]);
    expect(ids(await db.from('things').select().ilike('name', 'g%'))).toEqual(['c']);
    expect(ids(await db.from('things').select().ilike('name', '_eta'))).toEqual(['b']);
    expect(ids(await db.from('things').select().contains('tags', ['y']))).toEqual(['a', 'b']);
    expect(ids(await db.from('things').select().contains('tags', ['x', 'y']))).toEqual(['a']);
    expect(ids(await db.from('things').select().not('n', 'is', null))).toEqual(['a', 'c']);
    expect(ids(await db.from('things').select().not('id', 'in', ['a']))).toEqual(['b', 'c']);
  });

  it('filters on jsonb paths: ->> as text, -> as the raw value', async () => {
    const db = client();
    expect(ids(await db.from('things').select().eq('metrics->>label', 'hot'))).toEqual(['a']);
    expect(ids(await db.from('things').select().eq('metrics->>days', '10'))).toEqual(['a']);
    expect(ids(await db.from('things').select().gte('metrics->>days', 2))).toEqual(['a', 'b']);
    expect(ids(await db.from('things').select().is('metrics->>label', null))).toEqual(['b', 'c']);
    expect(ids(await db.from('things').select().eq('metrics->live', true))).toEqual(['a']);
    expect(ids(await db.from('things').select().eq('metrics->>live', 'false'))).toEqual(['b']);
  });

  it('orders with nulls last on ascending and first on descending, like PostgREST', async () => {
    const db = client();
    expect(ids(await db.from('things').select().order('n'))).toEqual(['c', 'a', 'b']);
    expect(ids(await db.from('things').select().order('n', { ascending: false }))).toEqual(['b', 'a', 'c']);
    expect(ids(await db.from('things').select().order('n', { ascending: true, nullsFirst: true }))).toEqual(['b', 'c', 'a']);
    expect(ids(await db.from('things').select().order('n', { ascending: false, nullsFirst: false }))).toEqual(['a', 'c', 'b']);
    expect(ids(await db.from('things').select().order('metrics->>days', { ascending: false }))).toEqual(['c', 'a', 'b']);
  });

  it('pages with range and limit', async () => {
    const db = client();
    expect(ids(await db.from('things').select().range(0, 1))).toEqual(['a', 'b']);
    expect(ids(await db.from('things').select().range(2, 5))).toEqual(['c']);
    expect(ids(await db.from('things').select().range(5, 9))).toEqual([]);
    expect(ids(await db.from('things').select().limit(1))).toEqual(['a']);
  });

  it('single errors with PGRST116 on zero or several rows, maybeSingle allows zero', async () => {
    const db = client();
    const none = await db.from('things').select().eq('id', 'nope').single();
    expect(none.data).toBe(null);
    expect(none.error.code).toBe('PGRST116');
    const many = await db.from('things').select().single();
    expect(many.error.code).toBe('PGRST116');
    const one = await db.from('things').select().eq('id', 'b').single();
    expect(one.data.id).toBe('b');
    const maybe = await db.from('things').select().eq('id', 'nope').maybeSingle();
    expect(maybe).toMatchObject({ data: null, error: null });
    const maybeMany = await db.from('things').select().maybeSingle();
    expect(maybeMany.error.code).toBe('PGRST116');
  });

  it('counts, and head returns no rows', async () => {
    const db = client();
    const head = await db.from('things').select('id', { count: 'exact', head: true });
    expect(head).toMatchObject({ data: null, error: null, count: 3 });
    const counted = await db.from('things').select('*', { count: 'exact' }).range(0, 0);
    expect(counted.count).toBe(3);
    expect(counted.data).toHaveLength(1);
  });

  it('an unknown table is empty, not an error', async () => {
    const res = await client().from('nothing_here').select('*');
    expect(res).toMatchObject({ data: [], error: null });
  });

  it('an unsupported method is a loud error, not a silent wrong answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await client().from('things').select().or('id.eq.a,id.eq.b');
    expect(res.error.code).toBe('DEMO_UNSUPPORTED');
    const bad = await client().from('things').select().filter('n', 'regex', 'x');
    expect(bad.error.code).toBe('DEMO_UNSUPPORTED');
    expect(warn).toHaveBeenCalled();
  });
});

describe('demo client: writes', () => {
  it('insert fills id and created_at and returns rows after select()', async () => {
    const db = client();
    const res = await db.from('things').insert({ name: 'Delta' }).select().single();
    expect(res.error).toBe(null);
    expect(res.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof res.data.created_at).toBe('string');
    const again = await db.from('things').select().eq('name', 'Delta');
    expect(again.data).toHaveLength(1);
  });

  it('insert without select returns no data', async () => {
    const res = await client().from('things').insert([{ name: 'E' }, { name: 'F' }]);
    expect(res).toMatchObject({ data: null, error: null });
  });

  it('insert with an existing id is a duplicate key error', async () => {
    const res = await client().from('things').insert({ id: 'a', name: 'dupe' });
    expect(res.error.code).toBe('23505');
  });

  it('update changes matching rows only', async () => {
    const db = client();
    const res = await db.from('things').update({ name: 'Beta' }).eq('id', 'b').select();
    expect(res.data.map((r) => r.name)).toEqual(['Beta']);
    expect((await db.from('things').select().eq('id', 'a').single()).data.name).toBe('Alpha');
  });

  it('delete removes matching rows', async () => {
    const db = client();
    await db.from('things').delete().eq('id', 'a');
    expect(ids(await db.from('things').select())).toEqual(['b', 'c']);
  });

  it('upsert updates on conflict and inserts otherwise', async () => {
    const db = client();
    await db.from('things').upsert({ id: 'a', name: 'Alpha 2' }, { onConflict: 'id' });
    await db.from('things').upsert({ id: 'z', name: 'Zed' }, { onConflict: 'id' });
    const res = await db.from('things').select().order('id');
    expect(res.data.find((r) => r.id === 'a').name).toBe('Alpha 2');
    expect(res.data.find((r) => r.id === 'a').n).toBe(3); // merged, not replaced
    expect(ids(res)).toContain('z');
  });

  it('upsert with ignoreDuplicates leaves existing rows alone', async () => {
    const db = client();
    await db.from('things').upsert({ id: 'a', name: 'nope' }, { onConflict: 'id', ignoreDuplicates: true });
    expect((await db.from('things').select().eq('id', 'a').single()).data.name).toBe('Alpha');
  });

  it('upsert on another column', async () => {
    const db = client();
    await db.from('things').upsert({ name: 'Gamma', n: 42 }, { onConflict: 'name' });
    expect((await db.from('things').select().eq('id', 'c').single()).data.n).toBe(42);
  });
});

describe('demo client: rpc, storage, auth, functions', () => {
  it('swipefile_health answers healthy at the expected schema version', async () => {
    const res = await client().rpc('swipefile_health');
    expect(res.error).toBe(null);
    expect(res.data).toEqual({ schema_version: EXPECTED_SCHEMA_VERSION, bucket_exists: true, bucket_public: false });
  });

  it('any other function is PGRST202, even with a chain after it', async () => {
    const db = client();
    const plain = await db.rpc('search_ads', { q: 'x' });
    expect(plain.error.code).toBe('PGRST202');
    const chained = await db.rpc('search_ads', { q: 'x' }, { count: 'exact' }).range(0, 47);
    expect(chained).toMatchObject({ data: null, error: { code: 'PGRST202' } });
    const single = await db.rpc('library_facets').single();
    expect(single.error.code).toBe('PGRST202');
  });

  it('upload then signed URL returns an object URL, remove forgets it', async () => {
    const db = client();
    const file = new Blob(['hello'], { type: 'image/png' });
    const up = await db.storage.from('ad-media').upload('u1/1-abc.png', file);
    expect(up.error).toBe(null);
    const signed = await db.storage.from('ad-media').createSignedUrl('u1/1-abc.png', 3600);
    expect(signed.data.signedUrl).toMatch(/^blob:/);
    const list = await db.storage.from('ad-media').list('u1');
    expect(list.data).toEqual([{ name: '1-abc.png' }]);
    const rm = await db.storage.from('ad-media').remove(['u1/1-abc.png']);
    expect(rm.data).toHaveLength(1);
    const gone = await db.storage.from('ad-media').createSignedUrl('u1/1-abc.png', 3600);
    expect(gone.error).toBeTruthy();
  });

  it('demo/*.svg paths sign to generated art with a SAMPLE label', async () => {
    const db = createDemoClient();
    const signed = await db.storage.from('ad-media').createSignedUrl(`demo/${AD_1}.svg`, 3600);
    expect(signed.data.signedUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(signed.data.signedUrl)).toContain('SAMPLE');
    const many = await db.storage.from('ad-media').createSignedUrls([`demo/${AD_2}.svg`, 'missing.png'], 60);
    expect(many.data[0].signedUrl).toMatch(/^data:image\/svg/);
    expect(many.data[1].signedUrl).toBe(null);
  });

  it('auth always has the demo user and never fails', async () => {
    const db = client();
    expect((await db.auth.getSession()).data.session.user.email).toBe(DEMO_USER.email);
    expect((await db.auth.getUser()).data.user.id).toBe(DEMO_USER.id);
    expect((await db.auth.signInWithPassword({ email: 'x', password: 'y' })).error).toBe(null);
    expect((await db.auth.signUp({ email: 'x', password: 'y' })).error).toBe(null);
    expect((await db.auth.signOut()).error).toBe(null);
    expect((await db.auth.updateUser({ password: 'z' })).error).toBe(null);
    const { data } = db.auth.onAuthStateChange(() => {});
    expect(typeof data.subscription.unsubscribe).toBe('function');
  });

  it('channels chain and removeChannel is harmless', async () => {
    const db = client();
    const ch = db.channel('x').on('postgres_changes', {}, () => {}).on('postgres_changes', {}, () => {}).subscribe();
    expect(ch).toBeTruthy();
    await expect(db.removeChannel(ch)).resolves.toBeDefined();
  });

  it('edge functions answer with the demo message', async () => {
    const res = await client().functions.invoke('ai', { body: {} });
    expect(res.data).toBe(null);
    expect(res.error).toMatchObject({ code: 'demo' });
    expect(res.error.message).toMatch(/your own Supabase project/);
  });
});

describe('demo client: lifecycle (E07)', () => {
  it('does not build the seed until the first call', async () => {
    const seed = vi.fn(tiny);
    const db = createDemoClient({ seed });
    expect(seed).not.toHaveBeenCalled();
    await db.from('things').select();
    await db.from('things').select();
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it('a second client starts from the seed again', async () => {
    const one = createDemoClient();
    await one.from('ads').update({ verdict: 'loser' }).eq('id', AD_1);
    await one.from('ads').delete().eq('id', AD_2);
    expect((await one.from('ads').select().eq('id', AD_1).single()).data.verdict).toBe('loser');
    const two = createDemoClient();
    expect((await two.from('ads').select().eq('id', AD_1).single()).data.verdict).toBe('testing');
    expect((await two.from('ads').select('id', { count: 'exact', head: true })).count).toBe(24);
  });
});

describe('demo seed', () => {
  const NOW = Date.parse('2026-09-29T10:00:00Z');
  const { tables, art } = buildSeed(NOW);
  const ads = tables.ads;
  const count = (fn) => ads.filter(fn).length;

  it('has 24 ads with unique fixed ids', () => {
    expect(ads).toHaveLength(24);
    expect(new Set(ads.map((a) => a.id)).size).toBe(24);
    expect(ads[0].id).toBe(demoId('ads', 1));
    expect(ads[23].id).toBe('00000000-0000-4000-8000-000000000024');
    expect(demoId('briefs', 1)).toBe('00000000-0000-4000-8000-000000000101');
    expect(POST_1).toBe('00000000-0000-4000-8000-000000000401');
  });

  it('has the agreed verdict mix', () => {
    expect(count((a) => a.verdict === 'winner')).toBe(7);
    expect(count((a) => a.verdict === 'testing')).toBe(6);
    expect(count((a) => a.verdict === 'loser')).toBe(4);
    expect(count((a) => a.verdict === 'unsure')).toBe(7);
  });

  it('has 8 brands with 3 ads each, own brand first', () => {
    expect(DEMO_BRANDS).toHaveLength(8);
    expect(DEMO_BRANDS[0]).toBe(DEMO_OWN_BRAND);
    for (const b of DEMO_BRANDS) expect(count((a) => a.brand === b)).toBe(3);
  });

  it('stars 4, flags 3 as recent, uses only the known tags', () => {
    const known = ['ugc', 'testimonial', 'static', 'carousel', 'founder', 'offer', 'before-after', 'review', 'how-to', 'seasonal', 'recently-added'];
    expect(count((a) => a.metrics.starred)).toBe(4);
    expect(count((a) => a.tags.includes('recently-added'))).toBe(3);
    for (const a of ads) for (const t of a.tags) expect(known).toContain(t);
  });

  it('gives media to ads 1 to 16 only, and 4 of the rest are video', () => {
    ads.forEach((a, i) => {
      if (i < 16) {
        expect(a.media_path).toBe(`demo/${a.id}.svg`);
        expect(a.format).toBe('image');
        expect(art[a.media_path]).toMatchObject({ brand: a.brand, hook: a.hook });
      } else {
        expect(a.media_path).toBe(null);
      }
    });
    expect(ads.slice(16).filter((a) => a.format === 'video')).toHaveLength(4);
    expect(Object.keys(art)).toHaveLength(16);
  });

  it('keeps hooks short and copy to 1 to 4 lines, landing pages on example.com', () => {
    for (const a of ads) {
      expect(a.hook.length).toBeLessThan(90);
      const lines = a.ad_copy.split('\n').length;
      expect(lines).toBeGreaterThanOrEqual(1);
      expect(lines).toBeLessThanOrEqual(4);
      expect(a.landing_url).toMatch(/^https:\/\/example\.com\/[a-z0-9-]+$/);
    }
  });

  it('gives rival ads fake library ids, run data and the agreed geo mix', () => {
    const rivals = ads.filter((a) => a.brand !== DEMO_OWN_BRAND);
    expect(rivals).toHaveLength(21);
    for (const a of rivals) {
      expect(a.metrics.ad_library_id).toMatch(/^99990000\d{7}$/);
      expect(a.metrics.days_running).toBeGreaterThanOrEqual(2);
      expect(a.metrics.days_running).toBeLessThanOrEqual(140);
      expect(typeof a.metrics.live).toBe('boolean');
      expect(a.metrics.reach).toBeGreaterThan(0);
      expect(a.metrics.source_url).toBeUndefined();
    }
    expect(rivals.filter((a) => a.geo_status === 'eu')).toHaveLength(12);
    expect(rivals.filter((a) => a.geo_status === 'none')).toHaveLength(6);
    expect(rivals.filter((a) => a.geo_status === 'unknown')).toHaveLength(3);
    for (const a of rivals.filter((r) => r.geo_status === 'eu')) {
      expect(a.countries.length).toBeGreaterThan(0);
      expect(a.eu_reach).toBeGreaterThan(0);
    }
    expect(ads.filter((a) => a.brand === DEMO_OWN_BRAND).every((a) => a.geo_status === 'unknown')).toBe(true);
  });

  it('scores every importer row and every own ad to the verdict it carries', () => {
    const imported = ads.filter((a) => a.added_by_email === 'adlib@import');
    expect(imported).toHaveLength(12);
    for (const a of imported) {
      expect(a.metrics.auto_verdict).toBe(a.verdict);
      expect(scoreVerdict(a).verdict).toBe(a.verdict);
    }
    for (const a of ads.filter((x) => x.brand === DEMO_OWN_BRAND)) {
      expect(scoreVerdict(a).verdict).toBe(a.verdict);
    }
  });

  it('has 12 hand added ads, one of them marked human', () => {
    const mine = ads.filter((a) => a.added_by_email === DEMO_USER.email);
    expect(mine).toHaveLength(12);
    expect(mine.filter((a) => a.metrics.verdict_by === 'human')).toHaveLength(1);
  });

  it('tags angles on 18 ads, covering every angle except other, and 3 AI reads', () => {
    const ANGLE_IDS = ['pain', 'curiosity', 'social_proof', 'offer', 'authority', 'story', 'comparison', 'urgency', 'identity', 'how_to'];
    const angled = ads.filter((a) => a.metrics.angle);
    expect(angled).toHaveLength(18);
    expect(new Set(angled.map((a) => a.metrics.angle))).toEqual(new Set(ANGLE_IDS));
    const withAi = ads.filter((a) => a.metrics.ai);
    expect(withAi).toHaveLength(3);
    for (const a of withAi) {
      expect(a.metrics.ai).toMatchObject({ model: 'sample' });
      for (const k of ['hook', 'angle', 'format', 'audience', 'why_it_works', 'weaknesses', 'remix_ideas', 'analyzed_at']) {
        expect(a.metrics.ai).toHaveProperty(k);
      }
      expect(Array.isArray(a.metrics.ai.remix_ideas)).toBe(true);
    }
  });

  it('spreads created_at over 60 days, ad 1 newest', () => {
    const times = ads.map((a) => Date.parse(a.created_at));
    expect(Math.max(...times)).toBe(times[0]);
    for (const t of times) expect(NOW - t).toBeLessThanOrEqual(60 * 86400000);
  });

  it('fills the other tables', () => {
    expect(tables.team).toEqual([expect.objectContaining({ id: DEMO_USER.id, nickname: 'You', role: 'admin' })]);
    expect(tables.briefs).toHaveLength(2);
    expect(tables.briefs[0].source_ad_ids).toHaveLength(3);
    expect(tables.briefs[0].body).toContain('>>> AI EDITOR PROMPT');
    expect(tables.briefs[0].body).toContain('<<< END PROMPT');
    expect(tables.competitors).toHaveLength(7);
    expect(tables.competitors.filter((c) => c.page_id === null)).toHaveLength(2);
    expect(tables.comments).toHaveLength(3);
    expect(new Set(tables.comments.map((c) => c.ad_id))).toEqual(new Set([AD_1, AD_2]));
    expect(tables.posts).toHaveLength(3);
    expect(tables.posts.filter((p) => p.brand === null)).toHaveLength(1);
    expect(tables.goals).toHaveLength(2);
    expect(tables.chat_messages).toHaveLength(2);
  });

  it('names no real company (E15)', () => {
    const REAL = ['Nike', 'Apple', 'Google', 'Amazon', 'Glossier', 'Allbirds', 'Gymshark', 'Huel', 'Olipop', 'Liquid Death'];
    const text = JSON.stringify(tables).toLowerCase();
    for (const name of REAL) expect(text).not.toContain(name.toLowerCase());
  });
});

describe('demo art', () => {
  it('draws a 1080 by 1350 SVG with the hook, the brand and a SAMPLE chip', () => {
    const svg = demoArtSvg({ brand: 'Kettle & Kite', hook: 'A <bold> "claim" it\'s', palette: ['#264653', '#E9C46A', '#F4A261'] });
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1350"');
    expect(svg).toContain('SAMPLE');
    expect(svg).toContain('Kettle &amp; Kite');
    expect(svg).toContain('&lt;bold&gt;');
    expect(svg).toContain('&quot;claim&quot;');
    expect(svg).toContain('it&apos;s');
    expect(svg).not.toMatch(/<bold>/);
  });
  it('puts every hook line inside a text element, so browsers draw it', () => {
    const svg = demoArtSvg({ brand: 'Northpaw', hook: 'Walks that tire them out before lunch', palette: ['#2F3E46', '#84A98C', '#CAD2C5'] });
    const hook = svg.match(/<text[^>]*font-size="64"[^>]*>(.*?)<\/text>/);
    expect(hook).not.toBeNull();
    expect(hook[1]).toContain('<tspan');
    expect(hook[1]).toContain('Walks that tire them');
    // A tspan outside a text element renders nothing.
    expect(svg).not.toMatch(/<g[^>]*>\s*<tspan/);
  });
  it('wraps to at most 4 lines', () => {
    const lines = wrapText('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen', 22, 4);
    expect(lines.length).toBeLessThanOrEqual(4);
    expect(lines[lines.length - 1].endsWith('...')).toBe(true);
    expect(wrapText('short', 22, 4)).toEqual(['short']);
    expect(wrapText('', 22, 4)).toEqual([]);
  });
  it('escapes all five XML characters', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
});
