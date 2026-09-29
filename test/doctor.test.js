import { describe, it, expect, vi } from 'vitest';
import { runDoctor } from '../src/lib/setup/doctor.js';
import { EXPECTED_SCHEMA_VERSION } from '../src/lib/setup/checks.js';

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const ANON = [b64url({ alg: 'HS256' }), b64url({ role: 'anon' }), 'sig'].join('.');
const config = { mode: 'live', url: 'https://p.supabase.co', anonKey: ANON, reason: null, missing: [] };

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function stubDb({ health, adsProbe = { error: null }, session = null } = {}) {
  const probe = vi.fn(() => ({ limit: async () => adsProbe }));
  return {
    probe,
    db: {
      rpc: vi.fn(async () => health),
      from: () => ({ select: probe }),
      auth: { getSession: async () => ({ data: { session } }) },
    },
  };
}

describe('runDoctor', () => {
  it('does not touch the network outside live mode', async () => {
    const fetch = vi.fn();
    const r = await runDoctor({ config: { mode: 'demo' }, db: null, fetch });
    expect(r.status).toBe('ok');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks auth settings with the anon key and reads health', async () => {
    const fetch = vi.fn(async () => response(200, { disable_signup: true }));
    const { db, probe } = stubDb({
      health: { data: { schema_version: EXPECTED_SCHEMA_VERSION, bucket_exists: true, bucket_public: false }, error: null },
      session: { user: { email: 'you@example.com' } },
    });
    const r = await runDoctor({ config, db, fetch });
    expect(fetch).toHaveBeenCalledWith('https://p.supabase.co/auth/v1/settings', expect.objectContaining({ headers: { apikey: ANON } }));
    expect(db.rpc).toHaveBeenCalledWith('swipefile_health');
    expect(probe).not.toHaveBeenCalled();
    expect(r.status).toBe('ok');
    expect(r.checks.find((c) => c.id === 'session').title).toBe('Signed in as you@example.com');
  });

  it('probes the ads table only when the health function is missing (E02)', async () => {
    const fetch = vi.fn(async () => response(200, { disable_signup: true }));
    const { db, probe } = stubDb({
      health: { data: null, error: { code: 'PGRST202', message: 'no function' } },
      adsProbe: { error: { code: 'PGRST205', message: 'Could not find the table public.ads' } },
    });
    const r = await runDoctor({ config, db, fetch });
    // A plain GET: supabase-js reports a HEAD request on a missing table as a
    // 204 with no error (measured on a local Supabase stack), so a HEAD probe
    // would never see PGRST205.
    expect(probe).toHaveBeenCalledWith('id');
    expect(r.status).toBe('blocking');
    expect(r.checks.find((c) => c.id === 'schema').title).toBe('The database has no swipefile tables');
  });

  it('a network failure blocks without asking the database', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const { db } = stubDb({ health: { data: null, error: null } });
    const r = await runDoctor({ config, db, fetch });
    expect(r.status).toBe('blocking');
    expect(r.checks.find((c) => c.id === 'reach').title).toBe('Cannot reach VITE_DB_URL');
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('a rejected key blocks', async () => {
    const fetch = vi.fn(async () => response(401, { message: 'Invalid API key' }));
    const { db } = stubDb({});
    const r = await runDoctor({ config, db, fetch });
    expect(r.checks.find((c) => c.id === 'reach').title).toBe('Supabase rejected VITE_DB_ANON_KEY');
  });

  it('a hung health call times out after 6 seconds instead of spinning forever', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => response(200, { disable_signup: true }));
    const db = {
      rpc: () => new Promise(() => {}),
      from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }),
      auth: { getSession: async () => ({ data: { session: null } }) },
    };
    const done = runDoctor({ config, db, fetch });
    await vi.advanceTimersByTimeAsync(6000);
    const r = await done;
    vi.useRealTimers();
    expect(r.checks.find((c) => c.id === 'schema').level).toBe('warn');
  });
});
