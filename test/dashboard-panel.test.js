import { describe, it, expect } from 'vitest';
import { topMetrics, nextActions, deepLinks, moneyText } from '../src/lib/dashboard.js';
import { buildSeed } from '../src/lib/demo/seed.js';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const DAY = 86400000;
const OWN = (b) => b === 'Driftwood Oats';
const NOBODY = () => false;
const seed = () => buildSeed(NOW).tables;
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const ALL = ['library', 'hooks', 'briefs', 'competitors', 'intel'];

const display = (g) => g.cells.map((c) => [c.label, c.display]);
const foot = (c) =>
  c.foot?.kind === 'delta' ? { direction: c.foot.delta.direction, diff: c.foot.delta.diff, tone: c.foot.delta.tone } : c.foot;

let n = 0;
const own = (metrics, over = {}) => ({ id: `o${++n}`, brand: 'Us', verdict: 'testing', status: 'running', metrics, ...over });
const rival = (metrics, over = {}) => ({ id: `r${++n}`, brand: 'Rival', verdict: 'unsure', status: 'running', metrics, ...over });
const US = (b) => b === 'Us';

describe('topMetrics on the seed', () => {
  it('gives "Your ads" with spend, ROAS and CTR when the brand is set', () => {
    const { you } = topMetrics({ ads: seed().ads, isOwn: OWN, ownBrandSet: true, now: NOW });
    expect(you.id).toBe('ads');
    expect(you.title).toBe('Your ads');
    expect(you.meta).toBe('as imported, no history');
    expect(display(you)).toEqual([['Spend', '€353'], ['ROAS', '1.67'], ['CTR', '2.52%']]);
    expect(you.cells.map(foot)).toEqual([
      { kind: 'text', text: '3 ads' },
      { kind: 'status', tone: 'good', word: 'Strong' },
      { kind: 'status', tone: 'neutral', word: 'OK' },
    ]);
    expect(you.cells.map((c) => c.to)).toEqual(['/insights#money', '/insights#money', '/insights#ads']);
  });

  it('gives the rival cells with flat toned deltas', () => {
    const { rivals } = topMetrics({ ads: seed().ads, isOwn: OWN, ownBrandSet: true, now: NOW });
    expect(rivals.title).toBe('Rivals');
    expect(display(rivals)).toEqual([['Running now', '11'], ['New, 30d', '8'], ['Live 60d+', '4']]);
    expect(rivals.cells.map(foot)).toEqual([
      { direction: 'down', diff: -2, tone: 'flat' },
      { direction: 'up', diff: 2, tone: 'flat' },
      { direction: 'flat', diff: 0, tone: 'flat' },
    ]);
    expect(rivals.cells.map((c) => c.to)).toEqual(['/competitors#activity', '/competitors#plays', '/competitors#plays']);
    expect(rivals.cells.every((c) => c.foot.period)).toBe(true);
  });

  it('gives "Your library" without an own brand', () => {
    const { you } = topMetrics({ ads: seed().ads, isOwn: NOBODY, ownBrandSet: false, now: NOW });
    expect(you.id).toBe('library');
    expect(you.meta).toBe('vs 30 days ago');
    expect(display(you)).toEqual([['Saved, 30d', '12'], ['Winners', '7'], ['Starred', '4']]);
    expect(foot(you.cells[0])).toEqual({ direction: 'flat', diff: 0, tone: 'flat' });
    expect(you.cells[0].foot.delta.prev).toBe(12);
    expect(you.cells[1].foot).toEqual({ kind: 'text', text: '5 still live' });
    expect(you.cells.map((c) => c.to)).toEqual(['/ads', '/ads?verdict=winner', '/ads?starred=1']);
  });

  it('keeps "Your library" when the brand is set but ownBrandSet is false', () => {
    expect(topMetrics({ ads: seed().ads, isOwn: OWN, ownBrandSet: false, now: NOW }).you.id).toBe('library');
  });

  it('drops the rival group with the module off or no rival ad', () => {
    expect(topMetrics({ ads: seed().ads, isOwn: OWN, now: NOW, competitorsOn: false }).rivals).toBeNull();
    const ownOnly = seed().ads.filter((a) => OWN(a.brand));
    expect(topMetrics({ ads: ownOnly, isOwn: OWN, now: NOW }).rivals).toBeNull();
  });
});

describe('topMetrics: what breaks it alone', () => {
  it.each([undefined, null, 'ads', 42, {}, []])('%s gives a library group of zeros and no rivals', (ads) => {
    const m = topMetrics({ ads, isOwn: OWN, now: NOW });
    expect(m.you.id).toBe('library');
    expect(m.you.cells.map((c) => c.value)).toEqual([0, 0, 0]);
    expect(m.rivals).toBeNull();
  });
  it('survives no arguments at all', () => {
    expect(topMetrics().you.id).toBe('library');
  });
  it('treats a missing isOwn as nobody', () => {
    const m = topMetrics({ ads: seed().ads, now: NOW });
    expect(m.you.id).toBe('library');
    expect(m.rivals.cells[0].value).toBe(14);
  });
  it('takes the first three of spend, ROAS, CTR, CPC that have a value', () => {
    const ads = [own({ spend: 40, clicks: 20 })];
    const { you } = topMetrics({ ads, isOwn: US, now: NOW });
    expect(display(you)).toEqual([['Spend', '€40.00'], ['CPC', '€2.00']]);
  });
  it('shows CPC when ROAS is missing', () => {
    const ads = [own({ spend: 200, impressions: 1000, clicks: 30 })];
    expect(display(topMetrics({ ads, isOwn: US, now: NOW }).you)).toEqual([
      ['Spend', '€200'],
      ['CTR', '3.00%'],
      ['CPC', '€6.67'],
    ]);
  });
  it('falls back to the library when own ads carry no spend', () => {
    const ads = [own({ spend: 0, ctr: 2 }), own({ spend: '' })];
    expect(topMetrics({ ads, isOwn: US, now: NOW }).you.id).toBe('library');
  });
});

describe('topMetrics: how rival deltas degrade', () => {
  it('says "no start dates yet" on all three when no rival ad has one', () => {
    const ads = [rival({ live: true }), rival({ live: true })];
    const { rivals } = topMetrics({ ads, isOwn: US, now: NOW });
    expect(rivals.cells[0].value).toBe(2);
    expect(rivals.cells.map((c) => c.foot)).toEqual([
      { kind: 'text', text: 'no start dates yet' },
      { kind: 'text', text: 'no start dates yet' },
      { kind: 'text', text: 'no start dates yet' },
    ]);
  });
  it('drops the running delta when more than a tenth of running ads are undated', () => {
    const ads = [
      ...Array.from({ length: 8 }, () => rival({ live: true, started_running: ago(40) })),
      rival({ live: true }),
      rival({ live: true }),
    ];
    const { rivals } = topMetrics({ ads, isOwn: US, now: NOW });
    expect(rivals.cells[0].value).toBe(10);
    expect(rivals.cells[0].foot).toEqual({ kind: 'text', text: 'no start dates on 2 ads' });
    expect(rivals.cells[1].foot.kind).toBe('delta');
  });
  it('keeps it at exactly a tenth', () => {
    const ads = [...Array.from({ length: 9 }, () => rival({ live: true, started_running: ago(40) })), rival({ live: true })];
    expect(topMetrics({ ads, isOwn: US, now: NOW }).rivals.cells[0].foot.kind).toBe('delta');
  });
  it('gives up from zero without a percent', () => {
    const ads = Array.from({ length: 3 }, (_, i) => rival({ live: true, started_running: ago(i + 1) }));
    const cell = topMetrics({ ads, isOwn: US, now: NOW }).rivals.cells[1];
    expect(foot(cell)).toEqual({ direction: 'up', diff: 3, tone: 'flat' });
    expect(cell.foot.delta.pct).toBeNull();
  });
  it('never colours a rival delta', () => {
    const ads = Array.from({ length: 5 }, (_, i) => rival({ live: true, started_running: ago(i * 20 + 1) }));
    for (const c of topMetrics({ ads, isOwn: US, now: NOW }).rivals.cells) {
      if (c.foot.kind === 'delta') expect(c.foot.delta.tone).toBe('flat');
    }
  });
});

describe('topMetrics: what it touches', () => {
  it('does not change its input', () => {
    const ads = seed().ads;
    const copy = JSON.parse(JSON.stringify(ads));
    topMetrics({ ads, isOwn: OWN, now: NOW });
    expect(ads).toEqual(copy);
  });
  it('counts a list that arrives twice once', () => {
    const ads = seed().ads;
    const twice = topMetrics({ ads: [...ads, ...ads], isOwn: OWN, now: NOW });
    expect(display(twice.you)).toEqual([['Spend', '€353'], ['ROAS', '1.67'], ['CTR', '2.52%']]);
    expect(twice.rivals.cells[0].value).toBe(11);
  });
  it('takes now as a date string', () => {
    const m = topMetrics({ ads: seed().ads, isOwn: OWN, now: '2026-09-30T12:00:00Z' });
    expect(m.rivals.cells[0].value).toBe(11);
  });
});

describe('nextActions', () => {
  it('puts the losing ad then the best winner first on the seed', () => {
    const list = nextActions({ ads: seed().ads, isOwn: OWN, now: NOW });
    expect(list.map((a) => a.id)).toEqual(['losing-running', 'winner-build']);
    expect(list[0]).toMatchObject({
      tone: 'bad',
      word: 'Losing',
      title: 'DO_founder_video_v2 is losing and still running',
      detail: 'ROAS 0.6 on €95 spent',
    });
    expect(list[1]).toMatchObject({
      tone: 'good',
      word: 'Winning',
      title: 'DO_reviews_ugc_v1 is your best ad',
      detail: 'ROAS 2.1 on €240, Social proof. Brief a variation.',
    });
    expect(list[0].to).toMatch(/^\/ad\//);
  });

  it('lists all five kinds in order with a high limit', () => {
    const list = nextActions({ ads: seed().ads, isOwn: OWN, now: NOW, limit: 10 });
    expect(list.map((a) => a.id)).toEqual(['losing-running', 'winner-build', 'no-read', 'rival-proven', 'untagged-winners']);
    expect(list[2]).toMatchObject({ tone: 'warn', word: 'No read yet', detail: '€18 spent, a read needs €25' });
  });

  it('without an own brand gives the newly proven rival then untagged winners', () => {
    const list = nextActions({ ads: seed().ads, isOwn: NOBODY, now: NOW });
    expect(list.map((a) => a.id)).toEqual(['rival-proven', 'untagged-winners']);
    expect(list[0].title).toBe('Sundial Skin has kept one ad live for 63 days');
    expect(list[0].tone).toBe('good');
    expect(list[1]).toMatchObject({ tone: 'neutral', title: '1 winner has no angle yet', to: '/ads?verdict=winner' });
  });

  it('skips a loser under the kill spend and a stopped loser', () => {
    const ads = [
      own({ spend: 49.99, roas: 0.2 }, { verdict: 'loser' }),
      own({ spend: 500, roas: 0.2, live: false }, { verdict: 'loser', status: 'dead' }),
    ];
    expect(nextActions({ ads, isOwn: US, now: NOW, limit: 10 }).map((a) => a.id)).not.toContain('losing-running');
  });

  it('takes the loser at exactly the kill spend, the largest spend first', () => {
    const ads = [own({ spend: 50, ctr: 0.5 }, { verdict: 'loser' }), own({ spend: 80, ctr: 0.4 }, { verdict: 'loser' })];
    const [first] = nextActions({ ads, isOwn: US, now: NOW });
    expect(first.detail).toBe('CTR 0.4% on €80 spent');
  });

  it('picks the best winner by ROAS, then CTR', () => {
    const ads = [
      own({ spend: 100, roas: 2, ctr: 1, ad_name: 'A' }, { verdict: 'winner' }),
      own({ spend: 100, roas: 2, ctr: 4, ad_name: 'B' }, { verdict: 'winner' }),
      own({ spend: 100, roas: 1.6, ctr: 9, ad_name: 'C' }, { verdict: 'winner' }),
    ];
    expect(nextActions({ ads, isOwn: US, now: NOW })[0].title).toBe('B is your best ad');
  });

  it('respects the limit and rejects a bad one', () => {
    const ads = seed().ads;
    expect(nextActions({ ads, isOwn: OWN, now: NOW, limit: 0 })).toEqual([]);
    expect(nextActions({ ads, isOwn: OWN, now: NOW, limit: 1 })).toHaveLength(1);
    expect(nextActions({ ads, isOwn: OWN, now: NOW, limit: -3 })).toHaveLength(2);
    expect(nextActions({ ads, isOwn: OWN, now: NOW, limit: 'x' })).toHaveLength(2);
  });

  it.each([undefined, null, 'x', {}, []])('%s gives nothing to act on', (ads) => {
    expect(nextActions({ ads, isOwn: OWN, now: NOW })).toEqual([]);
  });

  it('ignores a rival ad live 90 days or more and one under 60', () => {
    const ads = [rival({ live: true, started_running: ago(95) }), rival({ live: true, started_running: ago(59) })];
    expect(nextActions({ ads, isOwn: US, now: NOW })).toEqual([]);
  });

  it('counts an ad that arrives twice once and leaves the input alone', () => {
    const w = { id: 'w1', brand: 'X', verdict: 'winner', metrics: {} };
    const ads = [w, w, { ...w }];
    const list = nextActions({ ads, isOwn: US, now: NOW });
    expect(list[0].title).toBe('1 winner has no angle yet');
    expect(ads).toHaveLength(3);
  });
});

describe('deepLinks', () => {
  const brief = () => seed().briefs[0];
  it('gives the five tiles with their facts on the seed', () => {
    const links = deepLinks({ ads: seed().ads, isOwn: OWN, modules: ALL, latestBrief: brief(), now: NOW });
    expect(links.map((l) => [l.id, l.to, l.fact])).toEqual([
      ['insights', '/insights', '3 ads, 1 winning'],
      ['competitors', '/competitors', '6 rivals running ads'],
      ['intel', '/intel', '12 ads ran in the EU'],
      ['hooks', '/hooks', '24 hooks, 18 with an angle'],
      ['briefs', '/briefs', 'Latest 26 Sep'],
    ]);
  });
  it('counts winners without own numbers', () => {
    expect(deepLinks({ ads: seed().ads, isOwn: NOBODY, modules: [], now: NOW })).toEqual([
      { id: 'insights', to: '/insights', label: 'Insights', fact: '7 winners' },
    ]);
  });
  it('takes modules as a Set or a function', () => {
    const a = deepLinks({ ads: [], modules: new Set(['briefs']), now: NOW });
    const b = deepLinks({ ads: [], modules: (id) => id === 'briefs', now: NOW });
    expect(a).toEqual(b);
    expect(a.map((l) => l.fact)).toEqual(['0 winners', 'No brief yet']);
  });
  it('has fallbacks for empty modules', () => {
    const links = deepLinks({ ads: [], modules: ALL, latestBrief: { created_at: 'nope' }, now: NOW });
    expect(links.map((l) => l.fact)).toEqual(['0 winners', 'No rival tracked yet', 'Search ranks and demand', 'No hooks yet', 'No brief yet']);
  });
  it('says no rival is running when every rival ad stopped', () => {
    const ads = [rival({ live: false }, { status: 'dead' })];
    expect(deepLinks({ ads, isOwn: US, modules: ['competitors'], now: NOW })[1].fact).toBe('No rival running ads');
  });
  it('survives bad input', () => {
    expect(deepLinks()).toHaveLength(1);
    expect(deepLinks({ ads: 'x', modules: 7 })).toHaveLength(1);
  });
});

describe('moneyText', () => {
  it.each([
    [95, '€95'],
    [240, '€240'],
    [18.5, '€18.50'],
    [0, '€0'],
    [12400, '€12.4k'],
    [-5, '-€5'],
    [null, '-'],
    ['', '-'],
    [true, '-'],
    [NaN, '-'],
  ])('%s reads %s', (v, out) => {
    expect(moneyText(v)).toBe(out);
  });
  it('uses the currency', () => {
    expect(moneyText(20, 'usd')).toBe('$20');
    expect(moneyText(20, 'sek')).toBe('SEK 20');
  });
});
