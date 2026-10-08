import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluate, withSession, EXPECTED_SCHEMA_VERSION } from '../src/lib/setup/checks.js';

const live = { mode: 'live', url: 'https://p.supabase.co', anonKey: 'k', reason: null, missing: [] };
const okSettings = { ok: true, status: 200, body: { disable_signup: true } };
const okHealth = { data: { schema_version: EXPECTED_SCHEMA_VERSION, bucket_exists: true, bucket_public: false }, error: null };
const boot = (session = null, over = {}) =>
  evaluate({ config: live, env: {}, settings: okSettings, health: okHealth, keyKind: 'anon', session, ...over });
const sessionRow = (r) => r.checks.filter((c) => c.id === 'session');

describe('withSession', () => {
  it('turns "Not signed in" into "Signed in as" after a sign in, and leaves every other row alone', () => {
    const before = boot(null);
    const after = withSession(before, { email: 'you@example.com' });
    expect(sessionRow(after)).toEqual([expect.objectContaining({ level: 'info', title: 'Signed in as you@example.com' })]);
    expect(after.checks.filter((c) => c.id !== 'session')).toEqual(before.checks.filter((c) => c.id !== 'session'));
    expect(after.checks.map((c) => c.id)).toEqual(before.checks.map((c) => c.id));
  });

  it('goes back to "Not signed in" after a sign out', () => {
    const after = withSession(boot({ email: 'you@example.com' }), null);
    expect(sessionRow(after)[0].title).toBe('Not signed in');
  });

  it('treats a session without an email as not signed in', () => {
    expect(sessionRow(withSession(boot(null), {}))[0].title).toBe('Not signed in');
    expect(sessionRow(withSession(boot(null), undefined))[0].title).toBe('Not signed in');
  });

  it('keeps the overall status, since the session row is only info', () => {
    const warn = boot(null, { settings: { ok: true, status: 200, body: { disable_signup: false } } });
    expect(warn.status).not.toBe('ok');
    expect(withSession(warn, { email: 'you@example.com' }).status).toBe(warn.status);
    expect(withSession(boot(null), { email: 'you@example.com' }).status).toBe('ok');
  });

  it('does not change the result it was given', () => {
    const before = boot(null);
    const copy = JSON.parse(JSON.stringify(before));
    withSession(before, { email: 'you@example.com' });
    expect(before).toEqual(copy);
  });

  it('keeps extra fields such as loading', () => {
    const after = withSession({ ...boot(null), loading: true }, { email: 'you@example.com' });
    expect(after.loading).toBe(true);
  });

  it('returns demo and misconfigured results as they are, with no session row added', () => {
    const demo = evaluate({ config: { mode: 'demo' } });
    expect(withSession(demo, { email: 'you@example.com' })).toBe(demo);
    const bad = evaluate({ config: { mode: 'misconfigured', reason: 'missing_env', missing: ['VITE_DB_URL'] } });
    expect(withSession(bad, { email: 'you@example.com' })).toBe(bad);
  });

  it.each([[undefined], [null], [{}], [{ checks: 'nope' }], [{ status: 'ok', checks: [], loading: true }]])(
    'returns %j unchanged instead of throwing',
    (input) => {
      expect(withSession(input, { email: 'you@example.com' })).toBe(input);
    }
  );

  it('applied twice for the same session gives the same rows', () => {
    const once = withSession(boot(null), { email: 'you@example.com' });
    expect(withSession(once, { email: 'you@example.com' }).checks).toEqual(once.checks);
  });
});

describe('SetupContext listens for sign in and sign out', () => {
  const src = readFileSync(new URL('../src/lib/setup/SetupContext.jsx', import.meta.url), 'utf8');
  it('subscribes to auth changes in live mode and unsubscribes on unmount', () => {
    expect(src).toMatch(/onAuthStateChange\(/);
    expect(src).toMatch(/SIGNED_IN/);
    expect(src).toMatch(/SIGNED_OUT/);
    expect(src).toMatch(/unsubscribe/);
  });
  it('applies a sign in that lands while the check is still running', () => {
    expect(src).toMatch(/withSession\(result, lastSession\.current\)/);
  });
});
