import { describe, it, expect } from 'vitest';
import { LIBRARY_KEYS, DETAIL_KEYS, shouldIgnoreKey, keyAction, isTypingTarget } from '../../src/lib/library/keys.js';

const el = (tagName, extra = {}) => ({ tagName, ...extra });
const ev = (key, extra = {}) => ({ key, target: el('BODY'), ...extra });
// A document stand in: `open` lists the selectors that match something.
const doc = (open = []) => ({
  querySelector: (sel) => (open.some((s) => sel.includes(s)) ? {} : null),
});
const NONE = doc();

describe('shouldIgnoreKey', () => {
  it('lets a plain key on the page through', () => {
    expect(shouldIgnoreKey(ev('j'), NONE)).toBe(false);
  });
  it('ignores typing in every kind of field', () => {
    for (const t of [el('INPUT'), el('textarea'), el('SELECT'), el('DIV', { isContentEditable: true }), el('P', { getAttribute: () => 'true' }), el('P', { getAttribute: () => '' })]) {
      expect(shouldIgnoreKey(ev('j', { target: t }), NONE)).toBe(true);
      expect(shouldIgnoreKey(ev('Escape', { target: t }), NONE)).toBe(true);
    }
    expect(isTypingTarget(el('P', { getAttribute: () => 'false' }))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
  it('ignores ctrl, meta and alt, not shift', () => {
    expect(shouldIgnoreKey(ev('s', { ctrlKey: true }), NONE)).toBe(true);
    expect(shouldIgnoreKey(ev('s', { metaKey: true }), NONE)).toBe(true);
    expect(shouldIgnoreKey(ev('s', { altKey: true }), NONE)).toBe(true);
    expect(shouldIgnoreKey(ev('?', { shiftKey: true }), NONE)).toBe(false);
  });
  it('ignores an IME in the middle of composing', () => {
    expect(shouldIgnoreKey(ev('j', { isComposing: true }), NONE)).toBe(true);
    expect(shouldIgnoreKey(ev('Process', { keyCode: 229 }), NONE)).toBe(true);
  });
  it('ignores keys while a dialog or another sheet is open, not the key help', () => {
    expect(shouldIgnoreKey(ev('j'), doc(['[role="dialog"]']))).toBe(true);
    expect(shouldIgnoreKey(ev('j'), doc(['[data-sheet]']))).toBe(true);
    // The selector excludes the key help sheet itself.
    let asked = '';
    shouldIgnoreKey(ev('j'), { querySelector: (s) => ((asked = s), null) });
    expect(asked).toContain(':not([data-sheet="keys"])');
  });
  it('no event, or no document, is handled', () => {
    expect(shouldIgnoreKey(null, NONE)).toBe(true);
    expect(shouldIgnoreKey(ev('j'), null)).toBe(false);
    expect(shouldIgnoreKey(ev('j'), { querySelector: () => { throw new Error('bad'); } })).toBe(false);
  });
});

describe('keyAction', () => {
  it('maps every library and detail key', () => {
    for (const [key, action] of Object.entries(LIBRARY_KEYS)) {
      const shift = key === '?';
      expect(keyAction(LIBRARY_KEYS, ev(key, { shiftKey: shift }))).toBe(action);
    }
    for (const [key, action] of Object.entries(DETAIL_KEYS)) {
      const shift = key === '?' || key === '#';
      expect(keyAction(DETAIL_KEYS, ev(key, { shiftKey: shift }))).toBe(action);
    }
  });
  it('shift is only allowed where the key needs it', () => {
    expect(keyAction(LIBRARY_KEYS, ev('j', { shiftKey: true }))).toBe(null);
    expect(keyAction(LIBRARY_KEYS, ev('J', { shiftKey: true }))).toBe(null);
    expect(keyAction(LIBRARY_KEYS, ev('Enter', { shiftKey: true }))).toBe(null);
    expect(keyAction(DETAIL_KEYS, ev('#', { shiftKey: true }))).toBe('delete');
    expect(keyAction(DETAIL_KEYS, ev('#'))).toBe('delete');
    expect(keyAction(LIBRARY_KEYS, ev('?'))).toBe('help');
  });
  it('unknown keys, caps lock letters and inherited names give null', () => {
    expect(keyAction(LIBRARY_KEYS, ev('q'))).toBe(null);
    expect(keyAction(LIBRARY_KEYS, ev('W'))).toBe(null);
    expect(keyAction(LIBRARY_KEYS, ev('toString'))).toBe(null);
    expect(keyAction(LIBRARY_KEYS, ev('#'))).toBe(null);
    expect(keyAction(DETAIL_KEYS, ev('n'))).toBe(null);
    expect(keyAction(LIBRARY_KEYS, null)).toBe(null);
    expect(keyAction(null, ev('j'))).toBe(null);
    expect(keyAction(LIBRARY_KEYS, { key: 5 })).toBe(null);
  });
});
