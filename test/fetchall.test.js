import { describe, it, expect, vi } from 'vitest';
import { fetchAll } from '../src/lib/db.js';

// A stub client whose pages come from a list of answers, one per request.
function stubClient(answers) {
  const calls = [];
  const client = {
    from(table) {
      return {
        select() {
          return {
            range(from, to) {
              calls.push({ table, from, to });
              const next = answers.shift();
              if (next instanceof Error) return Promise.reject(next);
              return Promise.resolve(next);
            },
          };
        },
      };
    },
  };
  return { client, calls };
}
const page = (n, start = 0) => ({ data: Array.from({ length: n }, (_, i) => ({ id: start + i })), error: null });
const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('fetchAll', () => {
  it('pages until a short page', async () => {
    const { client, calls } = stubClient([page(2), page(2, 2), page(1, 4)]);
    const rows = await fetchAll((q) => q, 'ads', { client, pageSize: 2, delays: [0, 0] });
    expect(rows.map((r) => r.id)).toEqual([0, 1, 2, 3, 4]);
    expect(calls.map((c) => [c.from, c.to])).toEqual([[0, 1], [2, 3], [4, 5]]);
    expect(rows.error).toBeUndefined();
    expect(rows.partial).toBeUndefined();
  });

  it('stops on an empty page', async () => {
    const { client } = stubClient([page(2), { data: [], error: null }]);
    const rows = await fetchAll((q) => q, 'ads', { client, pageSize: 2, delays: [0, 0] });
    expect(rows).toHaveLength(2);
  });

  it('retries a failing page twice, then returns what it has, marked partial', async () => {
    quiet();
    const err = { message: 'timeout' };
    const { client, calls } = stubClient([page(2), { data: null, error: err }, { data: null, error: err }, { data: null, error: err }]);
    const rows = await fetchAll((q) => q, 'ads', { client, pageSize: 2, delays: [0, 0] });
    expect(rows.map((r) => r.id)).toEqual([0, 1]);
    expect(rows.error).toBe(err);
    expect(rows.partial).toBe(true);
    expect(calls).toHaveLength(4); // first page + 3 attempts at the second
    // Non enumerable: spreading or serialising the rows is unaffected.
    expect(Object.keys(rows)).toEqual(['0', '1']);
    expect(JSON.parse(JSON.stringify(rows))).toEqual([{ id: 0 }, { id: 1 }]);
  });

  it('recovers when a retry succeeds', async () => {
    quiet();
    const { client } = stubClient([page(2), { data: null, error: { message: 'blip' } }, page(1, 2)]);
    const rows = await fetchAll((q) => q, 'ads', { client, pageSize: 2, delays: [0, 0] });
    expect(rows.map((r) => r.id)).toEqual([0, 1, 2]);
    expect(rows.error).toBeUndefined();
  });

  it('treats a thrown request like an error', async () => {
    quiet();
    const { client } = stubClient([new Error('network down'), new Error('network down'), new Error('network down')]);
    const rows = await fetchAll((q) => q, 'ads', { client, pageSize: 2, delays: [0, 0] });
    expect(rows).toHaveLength(0);
    expect(rows.error.message).toBe('network down');
    expect(rows.partial).toBe(true);
  });

  it('waits between retries', async () => {
    quiet();
    vi.useFakeTimers();
    const { client, calls } = stubClient([{ data: null, error: { message: 'x' } }, page(1)]);
    const done = fetchAll((q) => q, 'ads', { client, pageSize: 2 });
    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const rows = await done;
    expect(calls).toHaveLength(2);
    expect(rows).toHaveLength(1);
    vi.useRealTimers();
  });

  it('passes the table name and the builder through', async () => {
    const { client, calls } = stubClient([page(0)]);
    const build = vi.fn((q) => q);
    await fetchAll(build, 'posts', { client });
    expect(build).toHaveBeenCalledTimes(1);
    expect(calls[0].table).toBe('posts');
  });
});
