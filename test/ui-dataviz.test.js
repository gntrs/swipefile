import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import * as ui from '../src/components/ui/index.js';
import SplitBar from '../src/components/charts/SplitBar.jsx';
import HeatStrip from '../src/components/charts/HeatStrip.jsx';
import BarList from '../src/components/charts/BarList.jsx';
import { deltaOf } from '../src/lib/periods.js';

const h = React.createElement;
const html = (el, location = '/') => renderToStaticMarkup(h(StaticRouter, { location }, el));
const DASHES = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
const count = (s, re) => (s.match(re) || []).length;

describe('Delta', () => {
  it('a rival count going down is grey, with its sentence', () => {
    const out = html(h(ui.Delta, { delta: deltaOf(11, 13), period: 'vs 30 days ago' }));
    expect(out).toContain('text-delta-flat');
    expect(out).not.toMatch(/text-delta-(good|bad)/);
    expect(out).toContain('>2<');
    expect(out).toContain('<span class="sr-only">down 2 from 13 (15%), vs 30 days ago</span>');
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('<svg');
  });
  it('green only when the direction is good for you, red when it is bad', () => {
    expect(html(h(ui.Delta, { delta: deltaOf(10, 0, { polarity: 'up' }) }))).toContain('text-delta-good');
    expect(html(h(ui.Delta, { delta: deltaOf(0, 10, { polarity: 'up' }) }))).toContain('text-delta-bad');
    expect(html(h(ui.Delta, { delta: deltaOf(0.36, 0.62, { polarity: 'down' }) }))).toContain('text-delta-good');
  });
  it('flat says No change and from what', () => {
    const out = html(h(ui.Delta, { delta: deltaOf(4, 4), period: 'vs 30 days ago' }));
    expect(out).toContain('No change');
    expect(out).toContain('no change from 4, vs 30 days ago');
  });
  it('up from zero has no percent', () => {
    const out = html(h(ui.Delta, { delta: deltaOf(8, 0), showPct: true }));
    expect(out).toContain('up 8 from 0<');
    expect(out).not.toContain('%');
  });
  it('formats the change and the before with the given format, pct and period on request', () => {
    const out = html(h(ui.Delta, { delta: deltaOf(150, 100, { polarity: 'up' }), format: (n) => `€${n}`, showPct: true, showPeriod: true, period: 'last 30 days' }));
    expect(out).toContain('€50');
    expect(out).toContain('(50%)');
    expect(out).toContain('up €50 from €100 (50%), last 30 days');
    expect(out).toMatch(/text-ink-soft[^>]*>last 30 days</);
  });
  it('renders nothing without a delta', () => {
    expect(html(h(ui.Delta, { delta: null }))).toBe('');
    expect(html(h(ui.Delta, {}))).toBe('');
    expect(html(h(ui.Delta, { delta: { direction: 'weird' } }))).toBe('');
  });
  it('deltaSentence is the same words', () => {
    expect(ui.deltaSentence(deltaOf(11, 13), { period: 'vs 30 days ago' })).toBe('down 2 from 13 (15%), vs 30 days ago');
    expect(ui.deltaSentence(null)).toBe('');
  });
});

describe('StatusDot', () => {
  it('every tone draws its mark beside the word in ink', () => {
    const marks = { good: 'bg-status-good', warn: 'bg-status-warn', bad: 'bg-status-bad', neutral: 'bg-status-neutral', live: 'bg-status-live', stopped: 'border-ink-soft' };
    expect(ui.STATUS_DOT_TONES).toEqual(Object.keys(marks));
    for (const [tone, cls] of Object.entries(marks)) {
      const out = html(h(ui.StatusDot, { tone }, 'Word'));
      expect(out, tone).toContain(cls);
      expect(out).toContain('text-ink');
      expect(out).toContain('>Word<');
      expect(out).toMatch(/aria-hidden="true"[^>]*w-2 h-2 rounded-full/);
    }
  });
  it('stopped is a hollow ring, not a fill', () => {
    expect(html(h(ui.StatusDot, { tone: 'stopped' }, 'Stopped'))).not.toMatch(/bg-status/);
  });
  it('an unknown tone falls back to neutral grey', () => {
    expect(html(h(ui.StatusDot, { tone: 'purple' }, 'x'))).toContain('bg-status-neutral');
  });
});

describe('KpiGroup', () => {
  const cells = [
    { id: 'running', label: 'Running now', value: 11, to: '/competitors#activity', foot: h(ui.Delta, { delta: deltaOf(11, 13), period: 'vs 30 days ago' }) },
    { id: 'new', label: 'New, 30d', value: 0, foot: 'none' },
    { id: 'live', label: 'Live 60d+', value: null, srText: 'no dates yet' },
  ];
  it('title, meta once, cells split by hairlines, links where given', () => {
    const out = html(h(ui.KpiGroup, { title: 'Rivals', meta: 'vs 30 days ago', cells }));
    expect(out).toMatch(/<h2[^>]*>Rivals<\/h2>/);
    expect(count(out, />vs 30 days ago</g)).toBe(1);
    expect(out).toContain('gap-px bg-line');
    expect(out).toContain('grid-cols-3');
    expect(count(out, /<a /g)).toBe(1);
    expect(out).toMatch(/<a class="[^"]*min-h-\[88px\][^"]*" href="\/competitors#activity"/);
    expect(out).toContain('press');
  });
  it('the number is mono ink, a 0 is ink soft, a missing value a muted hyphen', () => {
    const out = html(h(ui.KpiGroup, { title: 'Rivals', cells }));
    expect(out).toMatch(/num text-num-md[^"]*text-ink"[^>]*>11</);
    expect(out).toMatch(/num text-num-md[^"]*text-ink-soft"[^>]*>0</);
    expect(out).toMatch(/num text-num-md[^"]*text-ink-soft"[^>]*>-</);
    expect(out).not.toMatch(/text-num-md[^"]*(status|delta)/);
    expect(out).toContain('<span class="sr-only">no dates yet</span>');
    expect(out).not.toMatch(DASHES);
  });
  it('cols 4 is two by two on a phone and four from sm, cols 2 is two', () => {
    expect(html(h(ui.KpiGroup, { cols: 4, cells }))).toContain('grid-cols-2 sm:grid-cols-4');
    expect(html(h(ui.KpiGroup, { cols: 2, cells: cells.slice(0, 2) }))).toMatch(/grid grid-cols-2 gap-px/);
    expect(html(h(ui.KpiGroup, { cols: 7, cells }))).toContain('grid-cols-3');
  });
  it('fills the last row so no line shows through a hole', () => {
    const two = html(h(ui.KpiGroup, { cols: 3, cells: cells.slice(0, 2) }));
    expect(count(two, /aria-hidden="true" class="row-span-3 bg-card"/g)).toBe(1);
    const full = html(h(ui.KpiGroup, { cols: 3, cells }));
    expect(count(full, /aria-hidden="true" class="row-span-3 bg-card"/g)).toBe(0);
    const four = html(h(ui.KpiGroup, { cols: 4, cells }));
    expect(count(four, /aria-hidden="true" class="row-span-3 bg-card"/g)).toBe(1);
  });
  it('loading draws skeleton cells in the same grid, no links, no shimmer', () => {
    const out = html(h(ui.KpiGroup, { title: 'Rivals', loading: true, cells }));
    expect(out).toContain('aria-busy="true"');
    expect(count(out, /min-h-\[88px\]/g)).toBe(3);
    expect(out).not.toContain('<a ');
    expect(out).not.toContain('Running now');
    expect(out).not.toMatch(/animate-/);
  });
  it('no cells and no title still renders an empty card, not a crash', () => {
    expect(html(h(ui.KpiGroup, { cells: null }))).toContain('bg-card');
  });
});

describe('ScrollRow', () => {
  it('snaps and bleeds to the gutter under md, and becomes the given grid from md', () => {
    const out = html(h(ui.ScrollRow, { label: 'In depth', className: 'md:grid md:grid-cols-5', itemClassName: 'w-[44%]' }, h('a', { href: '/a' }, 'A'), null, h('a', { href: '/b' }, 'B')));
    expect(out).toMatch(/^<ul aria-label="In depth"/);
    for (const cls of ['scroll-x', 'snap-x', 'snap-mandatory', '-mx-[var(--gutter)]', 'px-[var(--gutter)]', 'scroll-px-[var(--gutter)]', 'md:mx-0', 'md:px-0', 'md:overflow-visible', 'md:grid-cols-5']) {
      expect(out, cls).toContain(cls);
    }
    expect(count(out, /<li /g)).toBe(2);
    expect(count(out, /snap-start/g)).toBe(2);
    expect(out).toContain('w-[44%]');
  });
});

describe('SectionNav', () => {
  const items = [{ id: 'money', label: 'Money' }, { id: 'ads', label: 'Your ads' }];
  it('a sticky labelled nav of 44px hash links on a solid canvas', () => {
    const out = html(h(ui.SectionNav, { items }));
    expect(out).toMatch(/^<nav aria-label="On this page"/);
    expect(out).toContain('sticky top-[env(safe-area-inset-top)]');
    expect(out).toContain('bg-canvas border-b border-line');
    expect(out).toContain('href="#money"');
    expect(count(out, /min-h-\[44px\] min-w-\[44px\]/g)).toBe(2);
    expect(out).not.toContain('aria-current');
  });
  it('marks the section in the hash', () => {
    const out = html(h(ui.SectionNav, { items, label: 'Sections' }), '/insights#ads');
    expect(out).toContain('aria-label="Sections"');
    expect(out).toMatch(/href="#ads" aria-current="location"/);
    expect(count(out, /aria-current/g)).toBe(1);
  });
  it('renders nothing without items', () => {
    expect(html(h(ui.SectionNav, { items: [] }))).toBe('');
  });
});

describe('layout recipes', () => {
  it('GRID_HALVES is one column then two from md, panels in a row stretch to one height', () => {
    expect(ui.GRID_HALVES).toBe('grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6');
  });
  it('SECTION_ANCHOR is a scroll margin that clears the status bar and the nav', () => {
    expect(ui.SECTION_ANCHOR).toMatch(/^scroll-mt-\[calc\(env\(safe-area-inset-top\)_\+_[\d.]+rem\)\]$/);
  });
  it('useHashScroll is a hook function', () => {
    expect(typeof ui.useHashScroll).toBe('function');
  });
});

describe('SplitBar', () => {
  const segments = [
    { key: 'winner', tone: 'good', label: 'Winners', value: 240, display: '€240' },
    { key: 'testing', tone: 'warn', label: 'Testing', value: 18, display: '€18' },
    { key: 'loser', tone: 'bad', label: 'Losers', value: 95, display: '€95' },
    { key: 'unsure', tone: 'neutral', label: 'Not judged', value: 0, display: '€0' },
  ];
  it('keeps the order given, drops a zero part, and prints the legend with shares', () => {
    const out = html(h(SplitBar, { caption: '€353 across 3 ads, by verdict', segments }));
    expect(out).toContain('<figcaption');
    const keys = [...out.matchAll(/data-key="(\w+)"/g)].map((m) => m[1]);
    expect(keys).toEqual(['winner', 'testing', 'loser']);
    expect(out).not.toContain('Not judged');
    expect(out).toContain('flex:240 1 0px');
    for (const bit of ['>Winners<', '>€240<', '>68%<', '>Testing<', '>€18<', '>5%<', '>Losers<', '>€95<', '>27%<']) expect(out, bit).toContain(bit);
    expect(out).toContain('h-3 gap-[2px] rounded-[4px] overflow-hidden');
  });
  it('colours each part by its tone and nothing else', () => {
    const out = html(h(SplitBar, { segments }));
    expect(out).toMatch(/data-key="winner" class="[^"]*bg-status-good/);
    expect(out).toMatch(/data-key="testing" class="[^"]*bg-status-warn/);
    expect(out).toMatch(/data-key="loser" class="[^"]*bg-status-bad/);
    const odd = html(h(SplitBar, { segments: [{ key: 'x', tone: 'pink', label: 'X', value: 1 }] }));
    expect(odd).toContain('bg-status-neutral');
    expect(odd).toContain('>1<');
    expect(odd).toContain('>100%<');
  });
  it('gives screen readers a table, and hides the drawn bar and legend', () => {
    const out = html(h(SplitBar, { caption: 'Spend', segments }));
    expect(out).toContain('<table class="sr-only">');
    expect(out).toContain('<caption>Spend</caption>');
    expect(out).toMatch(/<th scope="row">Winners<\/th><td>€240<\/td><td>68%<\/td>/);
    expect(count(out, /<tr>/g)).toBe(4);
  });
  it('renders nothing when every part is zero, missing or bad, and does not touch its input', () => {
    expect(html(h(SplitBar, { segments: [] }))).toBe('');
    expect(html(h(SplitBar, {}))).toBe('');
    expect(html(h(SplitBar, { segments: [null, { key: 'a', value: 0 }, { key: 'b', value: 'x' }, { key: 'c', value: -3 }] }))).toBe('');
    const copy = JSON.stringify(segments);
    html(h(SplitBar, { segments }));
    expect(JSON.stringify(segments)).toBe(copy);
  });
});

describe('HeatStrip', () => {
  it('one cell per value on the shared scale, as a labelled image', () => {
    const out = html(h(HeatStrip, { values: [0, 1, 2, 3], max: 3, label: 'Quillfox, ads running at each week\'s end' }));
    expect(out).toMatch(/^<div role="img" aria-label="Quillfox, ads running at each week(&#x27;|')s end: 0, 1, 2, 3"/);
    expect([...out.matchAll(/data-step="(\d)"/g)].map((m) => Number(m[1]))).toEqual([0, 1, 3, 5]);
    expect(out).toContain('bg-heat-0');
    expect(out).toContain('bg-heat-5');
    expect(out).toContain('h-[14px]');
    expect(out).toContain('gap-[2px]');
  });
  it('the same value takes the same step on the same max, a bigger max dims it', () => {
    const a = html(h(HeatStrip, { values: [2], max: 3 }));
    const b = html(h(HeatStrip, { values: [2], max: 9 }));
    expect(a).toContain('data-step="3"');
    expect(b).toContain('data-step="2"');
  });
  it('defaults max to the largest value and says unknown for a gap', () => {
    const out = html(h(HeatStrip, { values: [1, null, 4], label: 'x' }));
    expect(out).toContain('aria-label="x: 1, unknown, 4"');
    expect([...out.matchAll(/data-step="(\d)"/g)].map((m) => m[1])).toEqual(['1', '0', '5']);
  });
  it('has nothing to hover or tap and no title', () => {
    const out = html(h(HeatStrip, { values: [1, 2, 3], max: 3, label: 'x' }));
    expect(out).not.toMatch(/title=|tabindex|<a |<button/);
  });
  it('renders nothing for no values', () => {
    expect(html(h(HeatStrip, { values: [] }))).toBe('');
    expect(html(h(HeatStrip, { values: null }))).toBe('');
  });
});

describe('BarList tap', () => {
  it('a row with a tip and no link is a 44px button that can be tapped open', () => {
    const out = html(h(BarList, { rows: [{ key: 'a', label: 'Curiosity', value: 2, tip: 'two ads' }, { key: 'b', label: 'Story', value: 1, to: '/ads?angle=story', tip: 'one' }, { key: 'c', label: 'Offer', value: 1 }] }));
    expect(count(out, /role="button"/g)).toBe(1);
    expect(out).toMatch(/role="button" aria-expanded="false" tabindex="0"/);
    expect(out).toContain('href="/ads?angle=story"');
    expect(out).not.toContain('role="tooltip"');
  });
});
