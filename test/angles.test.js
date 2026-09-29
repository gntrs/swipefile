import { describe, it, expect } from 'vitest';
import * as app from '../src/lib/angles.js';
import * as edge from '../supabase/functions/_shared/angles.js';

describe('angles', () => {
  it('the app and the edge functions share one list', () => {
    expect(edge.ANGLES).toEqual(app.ANGLES);
    expect(edge.ANGLE_IDS).toEqual(app.ANGLE_IDS);
  });

  it('has eleven unique ids ending with other', () => {
    expect(app.ANGLE_IDS).toHaveLength(11);
    expect(new Set(app.ANGLE_IDS).size).toBe(11);
    expect(app.ANGLE_IDS.at(-1)).toBe('other');
    for (const a of app.ANGLES) {
      expect(a.id).toMatch(/^[a-z_]+$/);
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.hint.length).toBeGreaterThan(0);
    }
  });

  it('angleLabel names known ids and returns null for the rest', () => {
    expect(app.angleLabel('pain')).toBe('Pain point');
    expect(edge.angleLabel('how_to')).toBe('How to');
    expect(app.angleLabel('nope')).toBeNull();
    expect(app.angleLabel(undefined)).toBeNull();
  });

  it('angleOf reads only known angles from metrics', () => {
    expect(app.angleOf({ metrics: { angle: 'offer' } })).toBe('offer');
    expect(app.angleOf({ metrics: { angle: 'Offer' } })).toBeNull();
    expect(app.angleOf({ metrics: {} })).toBeNull();
    expect(app.angleOf({})).toBeNull();
    expect(app.angleOf(null)).toBeNull();
  });
});
