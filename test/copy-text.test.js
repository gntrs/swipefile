import { describe, it, expect, vi } from 'vitest';
import { copyText } from '../src/lib/copyText.js';

const board = (impl) => ({ writeText: vi.fn(impl) });

describe('copyText', () => {
  it('resolves true and hands the exact text to the clipboard once', async () => {
    const cb = board(() => Promise.resolve());
    expect(await copyText('Stop scrolling, read this', cb)).toBe(true);
    expect(cb.writeText).toHaveBeenCalledTimes(1);
    expect(cb.writeText).toHaveBeenCalledWith('Stop scrolling, read this');
  });

  it('resolves false, never throws, when the browser refuses', async () => {
    const cb = board(() => Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError')));
    await expect(copyText('hook', cb)).resolves.toBe(false);
  });

  it('resolves false when writeText throws synchronously', async () => {
    const cb = board(() => { throw new TypeError('boom'); });
    expect(await copyText('hook', cb)).toBe(false);
  });

  it('resolves false when there is no clipboard API (plain http on another device)', async () => {
    expect(await copyText('hook', undefined)).toBe(false);
    expect(await copyText('hook', null)).toBe(false);
    expect(await copyText('hook', {})).toBe(false);
    expect(await copyText('hook', { writeText: 'not a function' })).toBe(false);
  });

  it('falls back to navigator.clipboard when no clipboard is passed', async () => {
    const cb = board(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: cb });
    try {
      expect(await copyText('from navigator')).toBe(true);
      expect(cb.writeText).toHaveBeenCalledWith('from navigator');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('resolves false without a navigator at all', async () => {
    vi.stubGlobal('navigator', undefined);
    try {
      expect(await copyText('hook')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an object', { text: 'x' }],
  ])('resolves false for %s and does not touch the clipboard', async (_, value) => {
    const cb = board(() => Promise.resolve());
    expect(await copyText(value, cb)).toBe(false);
    expect(cb.writeText).not.toHaveBeenCalled();
  });

  it('keeps a single space and long text as they are', async () => {
    const cb = board(() => Promise.resolve());
    const long = 'x'.repeat(20000);
    expect(await copyText(' ', cb)).toBe(true);
    expect(await copyText(long, cb)).toBe(true);
    expect(cb.writeText.mock.calls.map((c) => c[0].length)).toEqual([1, 20000]);
  });

  it('answers each of two presses at once on its own', async () => {
    let n = 0;
    const cb = board(() => (++n === 1 ? Promise.reject(new Error('busy')) : Promise.resolve()));
    const [a, b] = await Promise.all([copyText('one', cb), copyText('two', cb)]);
    expect([a, b]).toEqual([false, true]);
    expect(cb.writeText).toHaveBeenCalledTimes(2);
  });
});
