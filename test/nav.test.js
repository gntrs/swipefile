import { describe, it, expect } from 'vitest';
import { parseModules } from '../src/lib/modules.js';
import { sidebarItems, mobileTabs, moreItems, NAV_ITEMS } from '../src/lib/nav.js';

const SOLO = { modules: parseModules(''), ready: { capture: false } };
const ALL = { modules: parseModules('all'), ready: { capture: false } };
const TEAM = { modules: parseModules('library,team'), ready: { capture: false } };
const ready = (opts) => ({ ...opts, ready: { capture: true } });

const labels = (items) => items.map((i) => i.label);
const shorts = (items) => items.map((i) => i.short);

describe('sidebarItems', () => {
  it('solo: dashboard then ads first, no team pages', () => {
    expect(labels(sidebarItems(SOLO))).toEqual(['Dashboard', 'Ads', 'Hook bank', 'Briefs', 'Competitors', 'Market intel']);
  });
  it('all: the long standing team list and order', () => {
    expect(labels(sidebarItems(ALL))).toEqual([
      'Dashboard', 'Ads', 'Hook bank', 'Briefs', 'Organic posts', 'Competitors', 'Market intel', 'Outreach', 'Availability',
    ]);
  });
  it('library,team: team mode with the solo modules skipped', () => {
    expect(labels(sidebarItems(TEAM))).toEqual(['Dashboard', 'Ads', 'Organic posts', 'Outreach', 'Availability']);
  });
  it('shows Capture last only when the feature is ready', () => {
    expect(labels(sidebarItems(ready(SOLO))).at(-1)).toBe('Capture');
    expect(labels(sidebarItems(ready(ALL))).at(-1)).toBe('Capture');
    expect(labels(sidebarItems(SOLO))).not.toContain('Capture');
  });
  it('ops alone is team mode without the team pages', () => {
    const ops = { modules: parseModules('ops'), ready: { capture: false } };
    expect(labels(sidebarItems(ops))).toEqual(['Dashboard', 'Ads']);
  });
  it('dashboard is the only item with end', () => {
    expect(sidebarItems(ALL).filter((i) => i.end).map((i) => i.to)).toEqual(['/']);
    expect(sidebarItems(SOLO).filter((i) => i.end).map((i) => i.to)).toEqual(['/']);
  });
  it('every mode leads with Dashboard then Ads', () => {
    for (const opts of [SOLO, ALL, TEAM, ready(SOLO), { modules: parseModules('library'), ready: {} }]) {
      expect(sidebarItems(opts).slice(0, 2).map((i) => i.id)).toEqual(['dashboard', 'ads']);
      expect(mobileTabs(opts).slice(0, 2).map((i) => i.id)).toEqual(['dashboard', 'ads']);
    }
  });
  it('has no separate overview item', () => {
    expect(NAV_ITEMS.overview).toBeUndefined();
  });
});

describe('mobileTabs', () => {
  it('solo: Home, Ads, Hooks, Rivals', () => {
    expect(shorts(mobileTabs(SOLO))).toEqual(['Home', 'Ads', 'Hooks', 'Rivals']);
  });
  it('all: Home, Ads, Posts, Rivals', () => {
    expect(shorts(mobileTabs(ALL))).toEqual(['Home', 'Ads', 'Posts', 'Rivals']);
  });
  it('library,team: Rivals is off and nothing is left to fill, so three tabs', () => {
    expect(shorts(mobileTabs(TEAM))).toEqual(['Home', 'Ads', 'Posts']);
  });
  it('replaces an off tab in place with the next fill item', () => {
    const noHooks = { modules: parseModules('library,briefs,competitors,intel'), ready: {} };
    expect(shorts(mobileTabs(noHooks))).toEqual(['Home', 'Ads', 'Briefs', 'Rivals']);
    const opsOnly = { modules: parseModules('ops,hooks'), ready: {} };
    expect(shorts(mobileTabs(opsOnly))).toEqual(['Home', 'Ads', 'Hooks']);
  });
  it('library alone: fewer tabs rather than a repeat', () => {
    const lib = { modules: parseModules('library'), ready: {} };
    expect(shorts(mobileTabs(lib))).toEqual(['Home', 'Ads']);
  });
});

describe('moreItems', () => {
  it('solo: Starred ads, Briefs, Market intel, Profile', () => {
    expect(labels(moreItems(SOLO))).toEqual(['Starred ads', 'Briefs', 'Market intel', 'Profile']);
  });
  it('solo with capture ready: Capture before Profile', () => {
    expect(labels(moreItems(ready(SOLO)))).toEqual(['Starred ads', 'Briefs', 'Market intel', 'Capture', 'Profile']);
  });
  it('all: the long standing list and order', () => {
    expect(labels(moreItems(ALL))).toEqual([
      'Starred ads', 'Hook bank', 'Briefs', 'Market intel', 'Outreach', 'Availability', 'Profile',
    ]);
    expect(labels(moreItems(ready(ALL))).at(-1)).toBe('Capture');
  });
  it('library,team: only what is on', () => {
    expect(labels(moreItems(TEAM))).toEqual(['Starred ads', 'Outreach', 'Availability', 'Profile']);
  });
  it('never repeats a tab', () => {
    for (const opts of [SOLO, ALL, TEAM, ready(SOLO), { modules: parseModules('library,briefs,competitors,intel'), ready: {} }]) {
      const tabs = new Set(mobileTabs(opts).map((i) => i.id));
      expect(moreItems(opts).filter((i) => tabs.has(i.id))).toEqual([]);
    }
  });
  it('starred matches only the starred library view', () => {
    const { match } = NAV_ITEMS.starred;
    expect(match({ pathname: '/ads', search: '?starred=1' })).toBe(true);
    expect(match({ pathname: '/ads', search: '' })).toBe(false);
    expect(match({ pathname: '/hooks', search: '?starred=1' })).toBe(false);
  });
});
