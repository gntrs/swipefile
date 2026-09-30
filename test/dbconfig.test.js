import { describe, it, expect } from 'vitest';
import { readDbConfig, classifyKey } from '../src/lib/dbConfig.js';

// Hand built JWTs. Built at runtime so no key shaped string sits in the repo.
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = (payload) => [b64url({ alg: 'HS256', typ: 'JWT' }), b64url(payload), 'signature'].join('.');
const ANON = jwt({ role: 'anon', iss: 'supabase' });
const SERVICE = jwt({ role: 'service_role', iss: 'supabase' });
const PUBLISHABLE = 'sb_publishable_' + 'x';
const SECRET = 'sb_secret_' + 'x';
const URL_OK = 'https://your-project.supabase.co';

describe('classifyKey', () => {
  it('reads the role claim of a JWT', () => {
    expect(classifyKey(ANON)).toBe('anon');
    expect(classifyKey(SERVICE)).toBe('service');
    expect(classifyKey(jwt({ role: 'authenticated' }))).toBe('unknown');
    expect(classifyKey(jwt({}))).toBe('unknown');
  });
  it('knows the new key prefixes', () => {
    expect(classifyKey(PUBLISHABLE)).toBe('publishable');
    expect(classifyKey(SECRET)).toBe('secret');
  });
  it('never throws on junk', () => {
    expect(classifyKey('')).toBe('unknown');
    expect(classifyKey(null)).toBe('unknown');
    expect(classifyKey(undefined)).toBe('unknown');
    expect(classifyKey(42)).toBe('unknown');
    expect(classifyKey('a.b.c')).toBe('unknown');
    expect(classifyKey('a.' + b64url('not an object').slice(0, 3) + '.c')).toBe('unknown');
    expect(classifyKey('just-a-string')).toBe('unknown');
  });
});

describe('readDbConfig', () => {
  it('is demo with nothing set (a fresh clone)', () => {
    expect(readDbConfig({})).toMatchObject({ mode: 'demo', reason: null, missing: [] });
    expect(readDbConfig()).toMatchObject({ mode: 'demo' });
    expect(readDbConfig(null)).toMatchObject({ mode: 'demo' });
  });
  it('is demo when VITE_DEMO=1, even with a full config', () => {
    expect(readDbConfig({ VITE_DEMO: '1', VITE_DB_URL: URL_OK, VITE_DB_ANON_KEY: ANON })).toMatchObject({ mode: 'demo' });
  });
  it('ignores VITE_DEMO values other than 1', () => {
    expect(readDbConfig({ VITE_DEMO: '0', VITE_DB_URL: URL_OK, VITE_DB_ANON_KEY: ANON }).mode).toBe('live');
  });
  it('names the missing key when only the URL is set', () => {
    expect(readDbConfig({ VITE_DB_URL: URL_OK })).toMatchObject({ mode: 'misconfigured', reason: 'missing_env', missing: ['VITE_DB_ANON_KEY'] });
  });
  it('names the missing URL when only the key is set', () => {
    expect(readDbConfig({ VITE_DB_ANON_KEY: ANON })).toMatchObject({ mode: 'misconfigured', reason: 'missing_env', missing: ['VITE_DB_URL'] });
  });
  it('rejects a URL that is not http(s)', () => {
    expect(readDbConfig({ VITE_DB_URL: 'your-project.supabase.co', VITE_DB_ANON_KEY: ANON })).toMatchObject({ mode: 'misconfigured', reason: 'bad_url' });
    expect(readDbConfig({ VITE_DB_URL: 'ftp://x.y', VITE_DB_ANON_KEY: ANON })).toMatchObject({ mode: 'misconfigured', reason: 'bad_url' });
  });
  it('refuses a service or secret key in the browser', () => {
    expect(readDbConfig({ VITE_DB_URL: URL_OK, VITE_DB_ANON_KEY: SERVICE })).toMatchObject({ mode: 'misconfigured', reason: 'service_key' });
    expect(readDbConfig({ VITE_DB_URL: URL_OK, VITE_DB_ANON_KEY: SECRET })).toMatchObject({ mode: 'misconfigured', reason: 'service_key' });
  });
  it('is live with a URL and an anon or publishable key, trailing slash removed', () => {
    expect(readDbConfig({ VITE_DB_URL: `${URL_OK}/`, VITE_DB_ANON_KEY: ANON })).toEqual({
      mode: 'live', url: URL_OK, anonKey: ANON, reason: null, missing: [],
    });
    expect(readDbConfig({ VITE_DB_URL: URL_OK, VITE_DB_ANON_KEY: PUBLISHABLE }).mode).toBe('live');
  });
  it('reads the legacy VITE_SUPABASE_* names', () => {
    expect(readDbConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: ANON })).toMatchObject({ mode: 'live', url: URL_OK });
  });
  it('treats whitespace only values as missing', () => {
    expect(readDbConfig({ VITE_DB_URL: '  ', VITE_DB_ANON_KEY: ' ' }).mode).toBe('demo');
  });
});
