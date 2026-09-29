import { describe, it, expect } from 'vitest';
import { evaluate, statusOf, EXPECTED_SCHEMA_VERSION, FIX } from '../src/lib/setup/checks.js';

const live = { mode: 'live', url: 'https://p.supabase.co', anonKey: 'k', reason: null, missing: [] };
const okSettings = { ok: true, status: 200, body: { disable_signup: true } };
const okHealth = { data: { schema_version: EXPECTED_SCHEMA_VERSION, bucket_exists: true, bucket_public: false }, error: null };
const healthy = (over = {}) => ({ config: live, env: {}, settings: okSettings, health: okHealth, keyKind: 'anon', session: { email: 'you@example.com' }, ...over });
const find = (r, id, level) => r.checks.find((c) => c.id === id && (!level || c.level === level));

describe('evaluate: modes decided from the environment', () => {
  it('demo is ok with one info row and the .env fix', () => {
    const r = evaluate({ config: { mode: 'demo' } });
    expect(r.status).toBe('ok');
    expect(r.checks).toEqual([expect.objectContaining({ id: 'env', level: 'info', title: 'Demo mode', fix: FIX.demo })]);
    expect(FIX.demo).toBe('Copy .env.example to .env, set VITE_DB_URL and VITE_DB_ANON_KEY from your Supabase project (Project Settings, API), then restart npm run dev.');
  });
  it('a missing value blocks, one row per name', () => {
    const r = evaluate({ config: { mode: 'misconfigured', reason: 'missing_env', missing: ['VITE_DB_ANON_KEY'] } });
    expect(r.status).toBe('blocking');
    expect(r.checks).toEqual([
      expect.objectContaining({
        id: 'env', level: 'fail', title: 'VITE_DB_ANON_KEY is missing',
        fix: 'Add VITE_DB_ANON_KEY to .env (Supabase: Project Settings, API) and restart npm run dev.',
      }),
    ]);
    const both = evaluate({ config: { mode: 'misconfigured', reason: 'missing_env', missing: ['VITE_DB_URL', 'VITE_DB_ANON_KEY'] } });
    expect(both.checks.map((c) => c.title)).toEqual(['VITE_DB_URL is missing', 'VITE_DB_ANON_KEY is missing']);
  });
  it('a bad URL blocks', () => {
    const r = evaluate({ config: { mode: 'misconfigured', reason: 'bad_url', url: 'nope' } });
    expect(r.status).toBe('blocking');
    expect(find(r, 'env', 'fail')).toMatchObject({ title: 'VITE_DB_URL is not a URL', fix: 'Use the project URL, like https://your-project.supabase.co' });
  });
  it('a secret key in the browser blocks and says to rotate it', () => {
    const r = evaluate({ config: { mode: 'misconfigured', reason: 'service_key' } });
    expect(r.status).toBe('blocking');
    expect(find(r, 'key_kind', 'fail')).toMatchObject({ title: 'VITE_DB_ANON_KEY holds a secret key' });
    expect(find(r, 'key_kind').fix).toContain('rotate that key');
  });
});

describe('evaluate: live project', () => {
  it('a healthy project is ok, every row green or info', () => {
    const r = evaluate(healthy());
    expect(r.status).toBe('ok');
    expect(r.checks.every((c) => c.level === 'ok' || c.level === 'info')).toBe(true);
    expect(find(r, 'session')).toMatchObject({ level: 'info', title: 'Signed in as you@example.com', fix: null });
    expect(find(r, 'bucket', 'ok')).toBeTruthy();
    expect(find(r, 'schema_version', 'ok')).toBeTruthy();
  });
  it('says Not signed in without a session', () => {
    expect(find(evaluate(healthy({ session: null })), 'session').title).toBe('Not signed in');
  });
  it('a network error or timeout on settings blocks', () => {
    for (const settings of [{ ok: false, error: { message: 'fetch failed' } }, undefined, { ok: false }]) {
      const r = evaluate(healthy({ settings }));
      expect(r.status).toBe('blocking');
      expect(find(r, 'reach', 'fail')).toMatchObject({ title: 'Cannot reach VITE_DB_URL', fix: FIX.unreachable });
    }
  });
  it('a 401 or 403 from settings means the key was rejected', () => {
    for (const status of [401, 403]) {
      const r = evaluate(healthy({ settings: { ok: false, status, body: null } }));
      expect(r.status).toBe('blocking');
      expect(find(r, 'reach', 'fail')).toMatchObject({ title: 'Supabase rejected VITE_DB_ANON_KEY', fix: FIX.rejectedKey });
    }
  });
  it('open sign ups warn (E05)', () => {
    const r = evaluate(healthy({ settings: { ok: true, status: 200, body: { disable_signup: false } } }));
    expect(r.status).toBe('warn');
    expect(find(r, 'signup', 'warn')).toMatchObject({ title: 'Anyone can sign up to this project', fix: FIX.openSignup });
  });
  it('VITE_ALLOW_SIGNUP=1 warns', () => {
    const r = evaluate(healthy({ env: { VITE_ALLOW_SIGNUP: '1' } }));
    expect(r.status).toBe('warn');
    expect(find(r, 'signup', 'warn')).toMatchObject({ title: 'Sign up is shown on the login page', fix: 'Remove VITE_ALLOW_SIGNUP from .env once your accounts exist.' });
  });
  it('no health function and no ads table blocks (E02)', () => {
    const r = evaluate(healthy({
      health: { data: null, error: { code: 'PGRST202', message: 'not found' } },
      adsProbe: { error: { code: 'PGRST205', message: 'Could not find the table public.ads' } },
    }));
    expect(r.status).toBe('blocking');
    expect(find(r, 'schema', 'fail')).toMatchObject({ title: 'The database has no swipefile tables', fix: FIX.noTables });
  });
  it('a 404 on the health call counts as missing too', () => {
    const r = evaluate(healthy({ health: { data: null, error: { message: 'x' }, status: 404 }, adsProbe: { error: { code: '42P01' } } }));
    expect(find(r, 'schema', 'fail')).toBeTruthy();
  });
  it('no health function but ads present means an older db-setup.sql (E14)', () => {
    const r = evaluate(healthy({ health: { data: null, error: { code: 'PGRST202' } }, adsProbe: { error: null } }));
    expect(r.status).toBe('warn');
    expect(find(r, 'schema', 'warn')).toMatchObject({ title: 'db-setup.sql is from an older version', fix: FIX.rerun });
  });
  it('an older schema version warns', () => {
    const r = evaluate(healthy({ health: { data: { schema_version: EXPECTED_SCHEMA_VERSION - 1, bucket_exists: true, bucket_public: false } } }));
    expect(r.status).toBe('warn');
    expect(find(r, 'schema_version', 'warn')).toMatchObject({ title: 'Some features need the latest db-setup.sql', fix: FIX.rerun });
  });
  it('a missing bucket warns (E03)', () => {
    const r = evaluate(healthy({ health: { data: { schema_version: EXPECTED_SCHEMA_VERSION, bucket_exists: false, bucket_public: false } } }));
    expect(r.status).toBe('warn');
    expect(find(r, 'bucket', 'warn')).toMatchObject({ title: 'Storage bucket ad-media is missing', fix: 'Uploads will fail until you re-run db-setup.sql, which creates the bucket.' });
  });
  it('a public bucket warns (E03)', () => {
    const r = evaluate(healthy({ health: { data: { schema_version: EXPECTED_SCHEMA_VERSION, bucket_exists: true, bucket_public: true } } }));
    expect(r.status).toBe('warn');
    expect(find(r, 'bucket', 'warn')).toMatchObject({ title: 'Bucket ad-media is public', fix: FIX.publicBucket });
  });
  it('an unexpected health error warns with the message instead of claiming ok', () => {
    const r = evaluate(healthy({ health: { data: null, error: { code: '500', message: 'boom' } } }));
    expect(r.status).toBe('warn');
    expect(find(r, 'schema', 'warn').detail).toBe('boom');
  });
  it('the rerun fix text is exact', () => {
    expect(FIX.rerun).toBe('Re-run db-setup.sql in the SQL editor. It is safe to run again and adds the storage bucket, its rules and newer features.');
  });
});

describe('statusOf', () => {
  it('blocking beats warn beats ok', () => {
    expect(statusOf([{ level: 'ok' }, { level: 'info' }])).toBe('ok');
    expect(statusOf([{ level: 'ok' }, { level: 'warn' }])).toBe('warn');
    expect(statusOf([{ level: 'warn' }, { level: 'fail' }])).toBe('blocking');
    expect(statusOf([])).toBe('ok');
  });
});
