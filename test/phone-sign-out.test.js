import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { signOutWith } from '../src/lib/signOut.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(ROOT + path, 'utf8');

const memoryStorage = (entries = {}) => {
  const m = new Map(Object.entries(entries));
  return { removeItem: vi.fn((k) => m.delete(k)), has: (k) => m.has(k) };
};

describe('signOutWith', () => {
  it('returns true and touches nothing local when the server signs out', async () => {
    const auth = { storageKey: 'sb-x-auth-token', signOut: vi.fn().mockResolvedValue({ error: null }) };
    const storage = memoryStorage({ 'sb-x-auth-token': '{}' });
    expect(await signOutWith(auth, storage)).toBe(true);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('forgets the session on this device when the server returns an error', async () => {
    const auth = { storageKey: 'sb-x-auth-token', signOut: vi.fn().mockResolvedValue({ error: new Error('503') }) };
    const storage = memoryStorage({ 'sb-x-auth-token': '{}', 'sb-x-auth-token-code-verifier': 'v', other: '1' });
    expect(await signOutWith(auth, storage)).toBe(false);
    expect(storage.has('sb-x-auth-token')).toBe(false);
    expect(storage.has('sb-x-auth-token-code-verifier')).toBe(false);
    expect(storage.has('other')).toBe(true);
  });

  it('forgets the session on this device when the server call throws', async () => {
    const auth = { storageKey: 'k', signOut: vi.fn().mockRejectedValue(new Error('fetch failed')) };
    const storage = memoryStorage({ k: '{}' });
    expect(await signOutWith(auth, storage)).toBe(false);
    expect(storage.has('k')).toBe(false);
  });

  it('never throws, even when storage is blocked', async () => {
    const auth = { storageKey: 'k', signOut: vi.fn().mockRejectedValue(new Error('down')) };
    const storage = { removeItem: () => { throw new Error('SecurityError'); } };
    await expect(signOutWith(auth, storage)).resolves.toBe(false);
  });

  it('copes with a client that returns nothing, or no storage at all', async () => {
    expect(await signOutWith({ signOut: vi.fn().mockResolvedValue(undefined) }, undefined)).toBe(true);
    expect(await signOutWith({ storageKey: 'k', signOut: vi.fn().mockResolvedValue({ error: {} }) }, null)).toBe(false);
  });
});

describe('sign out on phones', () => {
  const nav = read('src/components/MobileNav.jsx');

  it('the More sheet offers sign out outside demo mode only', () => {
    expect(nav).toMatch(/!IS_DEMO &&/);
    expect(nav).toMatch(/Sign out/);
  });

  it('the app has one sign out, shared by the sidebar and the sheet', () => {
    const ctx = read('src/contexts/AuthContext.jsx');
    expect(ctx).toMatch(/signOutWith\(db\.auth\)/);
    expect(ctx).toMatch(/setUser\(null\)/);
  });
});
