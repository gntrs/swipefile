import { describe, it, expect } from 'vitest';
import { bulkVerdict, bulkStar, bulkTags, bulkDelete, nextTags, MAX_SELECT } from '../../src/lib/library/bulk.js';

const NOW = new Date('2026-09-29T10:00:00.000Z');
const ad = (n, extra = {}) => ({ id: `id-${n}`, verdict: 'unsure', tags: ['x'], metrics: { days_running: n, auto_verdict: 'unsure' }, ...extra });

// A stub client. rpcResult decides what bulk_update_ads answers; updates and
// deletes are recorded, and failFor lists ids whose single update fails.
function stub({ rpcResult = { data: 1, error: null }, failFor = [], deleteError = null } = {}) {
  const calls = { rpc: [], update: [], delete: [], remove: [] };
  const client = {
    calls,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return typeof rpcResult === 'function' ? rpcResult(args) : rpcResult;
    },
    from: () => ({
      // select comes before the filter, see src/lib/byId.js.
      update: (patch) => ({
        select: () => ({
          eq: async (col, id) => {
            calls.update.push({ id, patch });
            return failFor.includes(id) ? { error: { message: `nope ${id}` } } : { error: null };
          },
        }),
      }),
      delete: () => ({
        select: () => ({
          in: async (col, ids) => {
            calls.delete.push(ids);
            return deleteError ? { error: deleteError } : { error: null };
          },
        }),
      }),
    }),
    storage: { from: () => ({ remove: async (paths) => { calls.remove.push(...paths); return { error: null }; } }) },
  };
  return client;
}
const MISSING = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, status: 404 };

describe('nextTags (same rule as the SQL)', () => {
  it('adds in order, dedupes, drops empty and removed ones', () => {
    expect(nextTags(['x', 'y'], { add: ['y', 'z', 'x', 'w', 'z', ''] })).toEqual(['x', 'y', 'z', 'w']);
    expect(nextTags(null, { add: ['a'] })).toEqual(['a']);
    expect(nextTags(['x', 'y', 'w'], { remove: ['y', 'w'] })).toEqual(['x']);
    expect(nextTags(['x'], { add: ['q'], remove: ['q'] })).toEqual(['x']);
    expect(nextTags(['x', 'x', ''], {})).toEqual(['x', 'x', '']);
  });
});

describe('bulk actions through the database function', () => {
  it('verdict: one rpc with every id, rows marked as a human verdict', async () => {
    const client = stub();
    const r = await bulkVerdict([ad(1), ad(2)], 'winner', { client, now: NOW });
    expect(client.calls.rpc).toEqual([{ name: 'bulk_update_ads', args: { p_ids: ['id-1', 'id-2'], p_patch: { verdict: 'winner' } } }]);
    expect(r.ok).toBe(true);
    expect(r.done).toBe(2);
    expect(r.rows[0]).toMatchObject({ verdict: 'winner', metrics: { days_running: 1, verdict_by: 'human', verdict_at: NOW.toISOString() } });
  });
  it('star and tags send their own patch', async () => {
    const client = stub();
    await bulkStar([ad(1)], true, { client });
    await bulkTags([ad(1)], { add: [' ugc ', 'ugc', ''], remove: ['x'] }, { client });
    expect(client.calls.rpc.map((c) => c.args.p_patch)).toEqual([{ starred: true }, { add_tags: ['ugc'], remove_tags: ['x'] }]);
  });
  it('an rpc error fails every ad in the call with its message', async () => {
    const client = stub({ rpcResult: { data: null, error: { message: 'permission denied' } } });
    const r = await bulkStar([ad(1), ad(2)], false, { client });
    expect(r).toMatchObject({ ok: false, done: 0 });
    expect(r.failed).toEqual([{ id: 'id-1', message: 'permission denied' }, { id: 'id-2', message: 'permission denied' }]);
  });
  it('bad input is refused without touching the database', async () => {
    const client = stub();
    expect((await bulkVerdict([ad(1)], 'great', { client })).failed[0].message).toBe('Unknown verdict: great');
    expect((await bulkStar([ad(1)], 'yes', { client })).ok).toBe(false);
    expect(client.calls.rpc).toEqual([]);
    expect(await bulkVerdict([], 'winner', { client })).toEqual({ ok: true, done: 0, failed: [], rows: [] });
    expect((await bulkVerdict([null, { id: '' }], 'winner', { client })).done).toBe(0);
  });
  it('more than MAX_SELECT ads go in several calls', async () => {
    const client = stub();
    const many = Array.from({ length: MAX_SELECT + 3 }, (_, i) => ad(i));
    const r = await bulkStar(many, true, { client });
    expect(client.calls.rpc.map((c) => c.args.p_ids.length)).toEqual([500, 3]);
    expect(r.done).toBe(503);
  });
});

describe('bulk actions on the older SQL (function missing)', () => {
  it('verdict: one update per ad through humanVerdictPatch, failures listed', async () => {
    const client = stub({ rpcResult: MISSING, failFor: ['id-2'] });
    const progress = [];
    const r = await bulkVerdict([ad(1), ad(2), ad(3)], 'loser', { client, now: NOW, onProgress: (d, t) => progress.push([d, t]) });
    expect(client.calls.update).toHaveLength(3);
    expect(client.calls.update[0].patch).toEqual({
      verdict: 'loser',
      metrics: { days_running: 1, auto_verdict: 'unsure', verdict_by: 'human', verdict_at: NOW.toISOString() },
    });
    expect(r).toMatchObject({ ok: false, done: 2, failed: [{ id: 'id-2', message: 'nope id-2' }] });
    expect(progress.at(-1)).toEqual([3, 3]);
  });
  it('runs at most four updates at a time', async () => {
    let active = 0;
    let peak = 0;
    const client = {
      rpc: async () => MISSING,
      from: () => ({
        update: () => ({
          select: () => ({
            eq: async () => {
              active++;
              peak = Math.max(peak, active);
              await new Promise((r) => setTimeout(r, 2));
              active--;
              return { error: null };
            },
          }),
        }),
      }),
    };
    const r = await bulkStar(Array.from({ length: 10 }, (_, i) => ad(i)), true, { client });
    expect(r.done).toBe(10);
    expect(peak).toBe(4);
  });
  it('star keeps the other metrics; tags follow the SQL rule', async () => {
    const client = stub({ rpcResult: MISSING });
    await bulkStar([ad(1)], true, { client });
    await bulkTags([ad(2, { tags: ['a', 'b'] })], { add: ['b', 'c'], remove: ['a'] }, { client });
    expect(client.calls.update[0].patch).toEqual({ metrics: { days_running: 1, auto_verdict: 'unsure', starred: true } });
    expect(client.calls.update[1].patch).toEqual({ tags: ['b', 'c'] });
  });
  it('a throwing client is a failure, not a crash', async () => {
    const client = { rpc: async () => MISSING, from: () => ({ update: () => ({ select: () => ({ eq: async () => { throw new Error('offline'); } }) }) }) };
    const r = await bulkStar([ad(1)], true, { client });
    expect(r.failed).toEqual([{ id: 'id-1', message: 'offline' }]);
  });
});

describe('bulkDelete', () => {
  it('deletes in chunks of 100 and removes stored files, never sample art', async () => {
    const client = stub();
    const ads = Array.from({ length: 150 }, (_, i) => ad(i, { media_path: i === 0 ? 'u/1.jpg' : i === 1 ? 'demo/x.svg' : null }));
    const r = await bulkDelete(ads, { client });
    expect(client.calls.delete.map((ids) => ids.length)).toEqual([100, 50]);
    expect(client.calls.remove).toEqual(['u/1.jpg']);
    expect(r).toMatchObject({ ok: true, done: 150, failed: [] });
  });
  it('a failed chunk keeps its files and lists its ads', async () => {
    const client = stub({ deleteError: { message: 'row level security' } });
    const r = await bulkDelete([ad(1, { media_path: 'u/1.jpg' })], { client });
    expect(r).toMatchObject({ ok: false, done: 0, failed: [{ id: 'id-1', message: 'row level security' }] });
    expect(client.calls.remove).toEqual([]);
  });
});
