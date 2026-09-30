import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readCsv, planSwipe, planMeta, LOOKUP_CHUNK } from '../../src/lib/csv/importPlan.js';

const USER = { id: 'user-1', email: 'you@example.com' };
const NOW = new Date('2026-09-29T10:00:00.000Z');
const fixture = (name) => readFileSync(new URL(`../fixtures/csv/${name}`, import.meta.url), 'utf8');

describe('readCsv', () => {
  it('detects both formats', () => {
    expect(readCsv(fixture('sample-100.csv')).format).toBe('swipe');
    expect(readCsv(fixture('meta-daily.csv')).format).toBe('meta');
  });
  it('refuses empty, unknown, too many rows and too many bytes, with the limit in the message', () => {
    expect(readCsv('brand,hook\n').error).toMatch(/no data rows/);
    expect(readCsv('').error).toMatch(/no data rows/);
    expect(readCsv('foo,bar\n1,2').error).toMatch(/Could not tell what this file is/);
    const big = `brand\n${Array.from({ length: 5001 }, (_, i) => `B${i}`).join('\n')}`;
    expect(readCsv(big).error).toBe('That file has 5,001 rows. The limit is 5,000 rows: split it into smaller files.');
    const ok = `brand\n${Array.from({ length: 5000 }, (_, i) => `B${i}`).join('\n')}`;
    expect(readCsv(ok).error).toBe(null);
    expect(readCsv('brand\nA', { bytes: 11 * 1024 * 1024 }).error).toMatch(/The limit is 10 MB/);
  });
});

describe('planSwipe', () => {
  it('sample-100: 100 new rows, preview of 20, lookups in chunks', async () => {
    const asked = [];
    const plan = await planSwipe(readCsv(fixture('sample-100.csv')), {
      user: USER,
      now: NOW,
      existingIds: async (ids) => {
        asked.push(ids.length);
        return [];
      },
    });
    expect(plan.inserts).toHaveLength(100);
    expect(plan.preview).toHaveLength(20);
    expect(plan.errors).toEqual([]);
    expect(asked).toEqual([100]);
    expect(plan.inserts[0]._line).toBeUndefined();
    expect(plan.inserts[0]).toMatchObject({ added_by: 'user-1', metrics: { source: 'csv' } });
  });
  it('skips ids already saved and ids twice in the file, keeps rows without an id', async () => {
    const text = [
      'brand,ad link,verdict',
      'A,https://www.facebook.com/ads/library/?id=999900000000001,',
      'B,https://www.facebook.com/ads/library/?id=999900000000002,',
      'C,https://www.facebook.com/ads/library/?id=999900000000002,',
      'D,,',
      'E,,bad',
    ].join('\n');
    const plan = await planSwipe(readCsv(text), { user: USER, now: NOW, existingIds: async () => ['999900000000001'] });
    expect(plan.inserts.map((a) => a.brand)).toEqual(['B', 'D']);
    expect(plan.duplicates.map((d) => [d.line, d.reason])).toEqual([[2, 'already saved'], [4, 'twice in this file']]);
    expect(plan.errors.map((e) => e.line)).toEqual([6]);
  });
  it('asks for at most LOOKUP_CHUNK ids at a time', async () => {
    const rows = Array.from({ length: 450 }, (_, i) => `B${i},${999900000100000 + i}`);
    const asked = [];
    await planSwipe(readCsv(`brand,library id\n${rows.join('\n')}`), {
      user: USER,
      existingIds: async (ids) => (asked.push(ids.length), []),
    });
    expect(asked).toEqual([LOOKUP_CHUNK, LOOKUP_CHUNK, 50]);
  });
  it('a failing lookup rejects, so the page can say so', async () => {
    await expect(
      planSwipe(readCsv('brand,library id\nA,999900000000001'), { user: USER, existingIds: async () => { throw new Error('offline'); } })
    ).rejects.toThrow('offline');
  });
});

describe('planMeta', () => {
  it('new names become rows like the script writes; known names refresh metrics and status only', async () => {
    const plan = await planMeta(readCsv(fixture('meta-daily.csv')), {
      user: USER,
      ownBrand: 'Sample Own',
      today: '2026-09-29',
      existingByName: async () => new Map([['Sample_founder_video_v3', { id: 'ad-9', metrics: { ad_name: 'Sample_founder_video_v3', starred: true, spend: 1 } }]]),
    });
    expect(plan.inserts.map((r) => r.hook)).toEqual(['Sample_breakfast_static_v1', 'Sample_reviews_ugc_v2, cut B']);
    expect(plan.inserts[0]).toMatchObject({
      brand: 'Sample Own', platform: 'Facebook', format: 'video', status: 'running', verdict: 'testing',
      added_by_email: 'csv@import', added_by: 'user-1',
    });
    expect(plan.inserts[0].metrics).toMatchObject({ ad_name: 'Sample_breakfast_static_v1', spend: 36.45, source: 'meta-csv' });
    expect(Object.values(plan.inserts[0].metrics)).not.toContain(undefined);
    expect(plan.updates).toEqual([
      {
        id: 'ad-9',
        name: 'Sample_founder_video_v3',
        patch: {
          metrics: expect.objectContaining({ starred: true, spend: 11.25, ad_name: 'Sample_founder_video_v3' }),
          status: 'dead',
        },
      },
    ]);
    expect(plan.updates[0].patch).not.toHaveProperty('verdict');
  });
});
