import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nodeVersionProblem, requireNode, MIN_NODE_MAJOR } from '../scripts/node-version.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('nodeVersionProblem', () => {
  it.each(['22.0.0', 'v22.23.2', '23.1.0', '24.0.0', '30.0.0'])('accepts %s', (v) => {
    expect(nodeVersionProblem(v)).toBeNull();
  });

  it.each([
    ['20.19.1', 'Node.js 20.19.1'],
    ['v21.7.3', 'Node.js 21.7.3'],
    ['18.0.0', 'Node.js 18.0.0'],
    ['0.12.0', 'Node.js 0.12.0'],
  ])('refuses %s and names it', (v, named) => {
    const msg = nodeVersionProblem(v);
    expect(msg).toContain(named);
    expect(msg).toContain(`Node.js ${MIN_NODE_MAJOR} or newer`);
    expect(msg).not.toMatch(/\n/);
  });

  it.each([[''], [null], ['banana'], [{}]])('refuses an unreadable version %s without throwing', (v) => {
    expect(nodeVersionProblem(v)).toContain('an unknown Node.js version');
  });

  it('defaults to the running Node.js, which the suite needs to be 22 or newer', () => {
    expect(nodeVersionProblem()).toBeNull();
  });

  it('agrees with engines in package.json and .nvmrc', () => {
    const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf8'));
    expect(pkg.engines.node).toBe(`>=${MIN_NODE_MAJOR}`);
    expect(readFileSync(ROOT + '.nvmrc', 'utf8').trim()).toBe(String(MIN_NODE_MAJOR));
  });
});

describe('requireNode', () => {
  it('returns true and neither logs nor exits on a good version', () => {
    const exit = vi.fn();
    const log = vi.fn();
    expect(requireNode('22.1.0', exit, log)).toBe(true);
    expect(exit).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('logs one line and exits with 1 on an old version', () => {
    const exit = vi.fn();
    const log = vi.fn();
    expect(requireNode('20.19.1', exit, log)).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('Node.js 20.19.1');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('create-users.mjs', () => {
  it('checks the Node.js version before it loads supabase-js', () => {
    const src = readFileSync(ROOT + 'scripts/create-users.mjs', 'utf8');
    const check = src.indexOf('requireNode();');
    const load = src.indexOf("await import('@supabase/supabase-js')");
    expect(check).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(check);
  });

  it('still runs on this Node.js and stops on bad arguments without a database', () => {
    const r = spawnSync(process.execPath, ['scripts/create-users.mjs', '--email', 'you@example.com', '--password', 'short'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('at least 8 characters');
    expect(r.stderr).not.toContain('Node.js 22 or newer');
  });
});
