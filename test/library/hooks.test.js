import { describe, it, expect } from 'vitest';
import { hookText, hookAngle, angleCounts } from '../../src/lib/library/hooks.js';
import { ANGLE_IDS } from '../../src/lib/angles.js';

describe('hookText', () => {
  it('prefers the headline, trimmed', () => {
    expect(hookText({ hook: '  Big line ', ad_copy: 'x' })).toBe('Big line');
  });
  it('falls back to the first non empty line of copy, capped at 140', () => {
    expect(hookText({ hook: ' ', ad_copy: '\n  first \nsecond' })).toBe('first');
    const long = 'a'.repeat(200);
    expect(hookText({ ad_copy: long })).toBe(`${'a'.repeat(137)}...`);
    expect(hookText({ ad_copy: 'a'.repeat(140) })).toBe('a'.repeat(140));
    expect(hookText({})).toBe('');
  });
});

describe('hookAngle and angleCounts', () => {
  it('the angle of the best ad, known angles only', () => {
    expect(hookAngle({ best: { metrics: { angle: 'pain' } } })).toBe('pain');
    expect(hookAngle({ best: { metrics: { angle: 'banana' } } })).toBe(null);
    expect(hookAngle({ best: null })).toBe(null);
    expect(hookAngle(undefined)).toBe(null);
  });
  it('counts per angle in list order, plus none', () => {
    const h = (angle) => ({ best: { metrics: angle ? { angle } : {} } });
    const r = angleCounts([h('story'), h('pain'), h('story'), h(null), h('banana')], ANGLE_IDS);
    expect(r).toEqual({ none: 2, angles: [{ id: 'pain', count: 1 }, { id: 'story', count: 2 }] });
    expect(angleCounts([], ANGLE_IDS)).toEqual({ none: 0, angles: [] });
  });
});
