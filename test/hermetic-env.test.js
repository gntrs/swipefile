import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../vite.config.js';
import { DB_MODE } from '../src/lib/db.js';

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

describe('tests ignore the .env of whoever runs them', () => {
  it('points envDir at test/ while vitest runs', () => {
    expect(process.env.VITEST).toBeTruthy();
    expect(config.envDir).toBe(TEST_DIR);
  });

  it('keeps test/ free of .env files, so nothing is loaded from there', () => {
    expect(readdirSync(TEST_DIR).filter((f) => f.startsWith('.env'))).toEqual([]);
  });

  it('sees no database settings and runs the app in demo mode', () => {
    expect(import.meta.env.VITE_DB_URL).toBeUndefined();
    expect(import.meta.env.VITE_DB_ANON_KEY).toBeUndefined();
    expect(DB_MODE).toBe('demo');
  });
});
