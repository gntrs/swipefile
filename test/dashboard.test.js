import { describe, it, expect } from 'vitest';
import { dashboardSummary, isRunning, winnerProof } from '../src/lib/dashboard.js';
import { buildSeed } from '../src/lib/demo/seed.js';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const DAY = 86400000;
const ago = (days) => new Date(NOW - days * DAY).toISOString();

let n = 0;
const ad = (over = {}) => ({
  id: `a${++n}`,
  brand: 'Rival',
  verdict: 'unsure',
  status: 'dead',
  created_at: ago(20),
  metrics: {},
  ...over,
});

const sum = (ads, opts = {}) => dashboardSummary(ads, { now: NOW, ...opts });

describe('dashboardSummary: bad input', () => {
  it.each([undefined, null, 'ads', 42, {}, []])('%s gives an all zero summary', (input) => {
    expect(sum(input)).toEqual({
      total: 0, winners: 0, running: 0, newThisWeek: 0, working: [], angles: [], noAngle: 0, rivals: [],
    });
  });
  it('skips rows that are not objects', () => {
    expect(sum([null, undefined, 3, 'x', ad()]).total).toBe(1);
  });
  it('counts an ad that arrives twice once', () => {
    const a = ad({ verdict: 'winner' });
    const s = sum([a, { ...a }, a]);
    expect(s.total).toBe(1);
    expect(s.winners).toBe(1);
    expect(s.working).toHaveLength(1);
  });
  it('keeps rows without an id', () => {
    expect(sum([ad({ id: undefined }), ad({ id: undefined })]).total).toBe(2);
  });
  it('does not mutate the input', () => {
    const list = [ad({ verdict: 'winner', metrics: { days_running: 3 } }), ad({ verdict: 'winner', metrics: { days_running: 90 } })];
    const copy = JSON.parse(JSON.stringify(list));
    sum(list);
    expect(list).toEqual(copy);
  });
});

describe('dashboardSummary: the four numbers', () => {
  it('new this week is the last 7 days, boundary included, bad and future dates ignored', () => {
    const s = sum([
      ad({ created_at: ago(0) }),
      ad({ created_at: ago(7) }),
      ad({ created_at: ago(7.01) }),
      ad({ created_at: 'not a date' }),
      ad({ created_at: null }),
      ad({ created_at: ago(-30) }),
    ]);
    expect(s.total).toBe(6);
    expect(s.newThisWeek).toBe(2);
  });
  it('running follows metrics.live, then the status', () => {
    const s = sum([
      ad({ metrics: { live: true }, status: 'dead' }),
      ad({ metrics: { live: false }, status: 'running' }),
      ad({ status: 'running' }),
      ad({ status: 'saved' }),
      ad({ metrics: null, status: 'running' }),
    ]);
    expect(s.running).toBe(3);
  });
  it('winners are verdict winner only', () => {
    expect(sum([ad({ verdict: 'winner' }), ad({ verdict: 'testing', metrics: { days_running: 200 } })]).winners).toBe(1);
  });
});

describe('dashboardSummary: what is working', () => {
  it('live winners first, then longest run, then best ROAS, then newest', () => {
    const dead90 = ad({ verdict: 'winner', metrics: { live: false, days_running: 90 } });
    const live10 = ad({ verdict: 'winner', metrics: { live: true, days_running: 10 } });
    const live60 = ad({ verdict: 'winner', metrics: { live: true, days_running: 60 } });
    const ownLow = ad({ verdict: 'winner', status: 'saved', metrics: { roas: 1.6 } });
    const ownHigh = ad({ verdict: 'winner', status: 'saved', metrics: { roas: 3 } });
    const loser = ad({ verdict: 'loser', metrics: { live: true, days_running: 400 } });
    const s = sum([dead90, live10, ownLow, live60, ownHigh, loser]);
    expect(s.working.map((a) => a.id)).toEqual([live60.id, live10.id, dead90.id, ownHigh.id, ownLow.id]);
  });
  it('shows at most `top`', () => {
    const many = Array.from({ length: 9 }, () => ad({ verdict: 'winner' }));
    expect(sum(many).working).toHaveLength(5);
    expect(sum(many, { top: 2 }).working).toHaveLength(2);
  });
});

describe('dashboardSummary: angles among winners', () => {
  it('counts known angles, sorts by count then label, and counts the rest as no angle', () => {
    const s = sum([
      ad({ verdict: 'winner', metrics: { angle: 'story' } }),
      ad({ verdict: 'winner', metrics: { angle: 'pain' } }),
      ad({ verdict: 'winner', metrics: { angle: 'pain' } }),
      ad({ verdict: 'winner', metrics: { angle: 'curiosity' } }),
      ad({ verdict: 'winner', metrics: { angle: 'made_up' } }),
      ad({ verdict: 'winner' }),
      ad({ verdict: 'loser', metrics: { angle: 'offer' } }),
    ]);
    expect(s.angles).toEqual([
      { id: 'pain', label: 'Pain point', count: 2 },
      { id: 'curiosity', label: 'Curiosity', count: 1 },
      { id: 'story', label: 'Story', count: 1 },
    ]);
    expect(s.noAngle).toBe(2);
  });
});

describe('dashboardSummary: rivals', () => {
  it('ranks by running then new in 30 days, drops quiet brands, own brand and blank brands', () => {
    const s = sum(
      [
        ad({ brand: 'Busy', metrics: { live: true } }),
        ad({ brand: 'Busy', metrics: { live: true } }),
        ad({ brand: 'Fresh', created_at: ago(3) }),
        ad({ brand: 'Fresh', created_at: ago(40) }),
        ad({ brand: 'Quiet', created_at: ago(90) }),
        ad({ brand: ' Ours ', metrics: { live: true } }),
        ad({ brand: '', metrics: { live: true } }),
        ad({ brand: null, metrics: { live: true } }),
        ad({ brand: 'One', metrics: { live: true }, created_at: ago(1) }),
      ],
      { isOwn: (b) => b.toLowerCase() === 'ours' },
    );
    expect(s.rivals).toEqual([
      { brand: 'Busy', running: 2, fresh: 2, total: 2 },
      { brand: 'One', running: 1, fresh: 1, total: 1 },
      { brand: 'Fresh', running: 0, fresh: 1, total: 2 },
    ]);
  });
  it('shows at most `top` rivals', () => {
    const many = 'ABCDEFGH'.split('').map((b) => ad({ brand: b, metrics: { live: true } }));
    expect(sum(many).rivals).toHaveLength(5);
  });
});

describe('isRunning and winnerProof', () => {
  it('isRunning tolerates missing pieces', () => {
    expect(isRunning(null)).toBe(false);
    expect(isRunning({})).toBe(false);
    expect(isRunning({ metrics: { live: 'yes' }, status: 'running' })).toBe(true);
  });
  it('winnerProof says the strongest fact it has', () => {
    expect(winnerProof(ad({ metrics: { live: true, days_running: 96 } }))).toBe('live 96d');
    expect(winnerProof(ad({ metrics: { live: false, days_running: 118 } }))).toBe('ran 118d');
    expect(winnerProof(ad({ metrics: { roas: 2.14 } }))).toBe('ROAS 2.1');
    expect(winnerProof(ad({ metrics: { ctr: 5.25 } }))).toBe('CTR 5.3%');
    expect(winnerProof(ad({ metrics: { days_running: 0, roas: 'x' } }))).toBe(null);
    expect(winnerProof(null)).toBe(null);
  });
});

describe('dashboardSummary on the demo seed', () => {
  it('fills every block', () => {
    const { tables } = buildSeed(NOW);
    const s = sum(tables.ads, { isOwn: (b) => b === 'Driftwood Oats' });
    expect(s.total).toBe(tables.ads.length);
    expect(s.winners).toBeGreaterThan(0);
    expect(s.newThisWeek).toBeGreaterThan(0);
    expect(s.working.length).toBeGreaterThan(0);
    expect(s.angles.length).toBeGreaterThan(0);
    expect(s.rivals.length).toBeGreaterThan(0);
    expect(s.rivals.map((r) => r.brand)).not.toContain('Driftwood Oats');
  });
});
