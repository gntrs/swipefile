import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../tailwind.config.js';

// The colours that carry a meaning, pinned in both places they live: the
// tailwind config (utilities) and index.css (css vars for SVG charts).
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(ROOT + 'src/index.css', 'utf8');
const { colors, fontSize } = config.theme.extend;

const cssVar = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  return m ? m[1].toUpperCase() : null;
};

const DELTA = { good: '#80E2B9', bad: '#FFADAC', flat: '#8B8B8B' };
const HEAT = { 0: '#262626', 1: '#4A4A4A', 2: '#6A6A6A', 3: '#8C8C8C', 4: '#AFAFAF', 5: '#D4D4D4' };
const STATUS = { good: '#36A980', warn: '#C18434', bad: '#C13140', neutral: '#8B8B8B', live: '#F4F4F5' };

describe('colour tokens', () => {
  it('delta: good and bad are the status text tints, flat the neutral grey', () => {
    for (const [k, hex] of Object.entries(DELTA)) {
      expect(colors.delta[k].toUpperCase(), `delta.${k}`).toBe(hex);
      expect(cssVar(`delta-${k}`), `--delta-${k}`).toBe(hex);
    }
    expect(colors.delta.good).toBe(colors.status['good-text']);
    expect(colors.delta.bad).toBe(colors.status['bad-text']);
    expect(colors.delta.flat).toBe(colors.status.neutral);
  });

  it('heat: six greys from the track to the bar grey, getting lighter', () => {
    expect(Object.keys(colors.heat).map(Number)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const [k, hex] of Object.entries(HEAT)) {
      expect(colors.heat[k].toUpperCase(), `heat.${k}`).toBe(hex);
      expect(cssVar(`heat-${k}`), `--heat-${k}`).toBe(hex);
    }
    expect(colors.heat[0]).toBe(colors.viz.track);
    expect(colors.heat[5]).toBe(colors.viz.bar);
    const lum = (hex) => parseInt(hex.slice(1, 3), 16);
    for (let i = 1; i <= 5; i += 1) expect(lum(HEAT[i])).toBeGreaterThan(lum(HEAT[i - 1]));
    for (const hex of Object.values(HEAT)) {
      expect(hex.slice(1, 3), `${hex} is grey`).toBe(hex.slice(3, 5));
      expect(hex.slice(3, 5)).toBe(hex.slice(5, 7));
    }
  });

  it('status marks are unchanged, in the config and in index.css', () => {
    for (const [k, hex] of Object.entries(STATUS)) {
      expect(colors.status[k].toUpperCase()).toBe(hex);
      expect(cssVar(`status-${k}`)).toBe(hex);
    }
  });

  it('adds no new hue: every new token is a status tint or a grey', () => {
    const known = new Set([...Object.values(colors.status), ...Object.values(colors.viz)].map((h) => h.toUpperCase()));
    for (const hex of Object.values(colors.delta)) expect(known.has(hex.toUpperCase())).toBe(true);
  });

  it('num-md is the key number size, and hover only applies where it can', () => {
    expect(fontSize['num-md']).toEqual(['1.375rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }]);
    expect(config.future?.hoverOnlyWhenSupported).toBe(true);
  });

  it('the gutter clears a sideways notch and text does not grow on rotation', () => {
    expect(css).toMatch(/--gutter:\s*max\(clamp\(20px, 4vw, 48px\), env\(safe-area-inset-left\), env\(safe-area-inset-right\)\)/);
    expect(css).toMatch(/-webkit-text-size-adjust:\s*100%/);
  });
});
