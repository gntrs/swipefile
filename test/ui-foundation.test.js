import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../tailwind.config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(ROOT + path, 'utf8');

describe('ui foundation', () => {
  it('loads no fonts from Google', () => {
    expect(read('index.html')).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('self hosts Figtree and JetBrains Mono from main.jsx', () => {
    const main = read('src/main.jsx');
    expect(main).toMatch(/import '@fontsource\/figtree\//);
    expect(main).toMatch(/import '@fontsource\/jetbrains-mono\//);
    expect(main).not.toMatch(/devFont/);
  });

  it('has no dev font picker left', () => {
    expect(existsSync(ROOT + 'src/lib/devFont.js')).toBe(false);
  });

  it('puts Figtree first in the sans stack and JetBrains Mono first in mono', () => {
    const { fontFamily } = config.theme.extend;
    expect(fontFamily.sans[0]).toBe('Figtree');
    expect(fontFamily.mono[0]).toBe('"JetBrains Mono"');
  });

  it('defines the type scale without overriding the tailwind defaults', () => {
    const sizes = config.theme.extend.fontSize;
    for (const key of ['meta', 'small', 'ui', 'body', 'lead', 'title', 'h2', 'h1', 'num', 'num-lg']) {
      expect(sizes[key], key).toBeDefined();
    }
    for (const key of ['xs', 'sm', 'base', 'lg']) expect(sizes[key], key).toBeUndefined();
    // text-meta is the floor: 0.75rem, 12px at the phone root.
    expect(sizes.meta[0]).toBe('0.75rem');
  });
});

// The primitives, rendered to markup in node. Importing them must not touch
// window or document.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import * as ui from '../src/components/ui/index.js';
import Pill from '../src/components/Pill.jsx';

const h = React.createElement;
const html = (el) => renderToStaticMarkup(h(StaticRouter, { location: '/' }, el));
const DASHES = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');

describe('ui primitives', () => {
  it('Page carries data-page, and narrow adds a left aligned 720 column', () => {
    const wide = html(h(ui.Page, { id: 'library' }, 'x'));
    expect(wide).toContain('data-page="library"');
    expect(wide).toContain('max-w-[var(--maxw)]');
    expect(wide).not.toContain('max-w-[720px]');
    const narrow = html(h(ui.Page, { id: 'briefs', width: 'narrow' }, 'x'));
    expect(narrow).toContain('max-w-[720px]');
    expect(narrow).not.toMatch(/max-w-\[720px\][^"]*mx-auto/);
  });

  it('Page without an id writes no data-page, so a fallback never passes as a page', () => {
    expect(html(h(ui.Page, null, 'x'))).not.toContain('data-page');
  });

  it('PageHeader renders the h1, context, eyebrow, back link and actions', () => {
    const out = html(
      h(ui.PageHeader, {
        title: 'Ad library',
        context: '24 saved',
        eyebrow: 'Monday',
        back: { to: '/ads', label: 'Library' },
        actions: h(ui.Button, { variant: 'primary' }, 'Add ad'),
      })
    );
    expect(out).toMatch(/<h1[^>]*text-h1[^>]*>Ad library<\/h1>/);
    expect(out).toContain('24 saved');
    expect(out).toContain('label-mono');
    expect(out).toContain('href="/ads"');
    expect(out).toContain('Add ad');
  });

  it('PageHeader leaves out what it is not given', () => {
    const out = html(h(ui.PageHeader, { title: 'Briefs' }));
    expect(out).not.toContain('label-mono');
    expect(out).not.toContain('href=');
  });

  it('Button renders a button, a router link or an anchor, all 44 tall', () => {
    expect(html(h(ui.Button, null, 'Go'))).toMatch(/^<button type="button"[^>]*min-h-\[44px\]/);
    expect(html(h(ui.Button, { to: '/ads' }, 'Go'))).toMatch(/^<a[^>]*href="\/ads"/);
    expect(html(h(ui.Button, { href: 'https://x.test' }, 'Go'))).toMatch(/^<a[^>]*href="https:\/\/x.test"/);
    expect(html(h(ui.Button, { type: 'submit' }, 'Go'))).toContain('type="submit"');
    expect(html(h(ui.Button, { variant: 'primary' }, 'Go'))).toContain('bg-accent');
    expect(html(h(ui.Button, { variant: 'nope' }, 'Go'))).toContain('bg-white/[0.06]');
  });

  it('IconButton takes its accessible name from label and reports pressed only when given', () => {
    const out = html(h(ui.IconButton, { label: 'Close', icon: 'span' }));
    expect(out).toContain('aria-label="Close"');
    expect(out).toContain('w-11 h-11');
    expect(out).not.toContain('aria-pressed');
    expect(html(h(ui.IconButton, { label: 'Star', pressed: true }))).toContain('aria-pressed="true"');
  });

  it('Meta joins with a muted middle dot, drops empty bits and keeps 0', () => {
    const out = html(h(ui.Meta, { items: ['Quillfox', null, '', false, undefined, 'live 140d', 0] }));
    expect(out.match(/·/g)).toHaveLength(2);
    expect(out).toContain('Quillfox');
    expect(out).toContain('live 140d');
    expect(out).toContain('>0<');
    expect(out).not.toMatch(DASHES);
    expect(html(h(ui.Meta, { items: [null, ''] }))).toBe('');
  });

  it('Metrics prints a muted hyphen for a missing value, never a dash', () => {
    const out = html(h(ui.Metrics, { items: [{ label: 'CTR', value: '2.1%' }, { label: 'CPC', value: null }, { label: 'Spend', value: '' }, { label: 'Clicks', value: 0 }] }));
    expect(out).toContain('<dt');
    expect(out.match(/>-</g)).toHaveLength(2);
    expect(out).toContain('>0<');
    expect(out).not.toMatch(DASHES);
    expect(out).toContain('grid-cols-3');
    expect(html(h(ui.Metrics, { items: [], cols: 9 }))).toContain('grid-cols-3');
  });

  it('Badge and the old Pill are the same thing, sentence case, Figtree', () => {
    const a = html(h(ui.Badge, { tone: 'good' }, 'Winner'));
    const b = html(h(Pill, { tone: 'good' }, 'Winner'));
    expect(a).toBe(b);
    expect(a).not.toMatch(/uppercase|font-mono/);
    expect(html(h(ui.Badge, { tone: 'weird' }, 'x'))).toContain('text-ink-soft');
  });

  it('Segmented is a labelled group of pressed buttons, selected is not white', () => {
    const out = html(h(ui.Segmented, { label: 'Whose ads', value: 'ours', options: [{ id: 'all', label: 'All' }, { id: 'ours', label: 'Ours', count: 3 }] }));
    expect(out).toContain('role="group"');
    expect(out).toContain('aria-label="Whose ads"');
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(out.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(out).toContain('bg-white/[0.12]');
    expect(out).not.toContain('bg-accent');
  });

  it('RemovableChip names what it removes', () => {
    expect(html(h(ui.RemovableChip, { label: 'Tag: ugc', onRemove() {} }))).toContain('aria-label="Remove filter: Tag: ugc"');
  });

  it('ActiveFilters renders nothing when empty', () => {
    expect(html(h(ui.ActiveFilters, { items: [], onClearAll() {} }))).toBe('');
    const out = html(h(ui.ActiveFilters, { items: [{ key: 'v', label: 'Winner', onRemove() {} }], onClearAll() {} }));
    expect(out).toContain('Remove filter: Winner');
    expect(out).toContain('Clear all');
  });

  it('SearchField is a labelled search input', () => {
    const out = html(h(ui.SearchField, { value: 'hi', onChange() {}, label: 'Search ads', placeholder: 'Search...' }));
    expect(out).toContain('type="search"');
    expect(out).toContain('aria-label="Search ads"');
    expect(out).toContain('value="hi"');
  });

  it('FilterPanel shows its count only when filters are on and renders no dialog while closed', () => {
    const closed = html(h(ui.FilterPanel, { count: 0, open: false, onOpenChange() {} }, 'x'));
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain('data-sheet');
    expect(closed).not.toContain('class="num');
    expect(html(h(ui.FilterPanel, { count: 2, open: false, onOpenChange() {} }))).toMatch(/num[^>]*>2</);
  });

  it('Sheet renders nothing on the server or when closed', () => {
    expect(html(h(ui.Sheet, { open: false, title: 'More', sheetId: 'more' }, 'x'))).toBe('');
  });

  it('Field ties the label to its control and ids the hint and error', () => {
    const out = html(h(ui.Field, { label: 'Brand', htmlFor: 'b', hint: 'Who made it', error: 'Required' }, h('input', { id: 'b' })));
    expect(out).toContain('for="b"');
    expect(out).toContain('id="b-hint"');
    expect(out).toContain('id="b-error"');
    expect(out).not.toMatch(/font-mono|uppercase/);
  });

  it('Row keeps leading and trailing outside its link', () => {
    const out = html(
      h(ui.List, null, h(ui.Row, { to: '/ad/1', leading: h('button', null, 'sel'), title: 'Hook', meta: 'm', trailing: h('button', null, 'copy') }))
    );
    expect(out).toMatch(/^<ul[^>]*divide-y/);
    const link = out.match(/<a[^>]*>.*?<\/a>/)[0];
    expect(link).toContain('Hook');
    expect(link).not.toContain('<button');
  });

  it('EmptyState and Notice render their parts', () => {
    const empty = html(h(ui.EmptyState, { title: 'Nothing yet', text: 'Add one', action: h(ui.Button, null, 'Add') }));
    expect(empty).toContain('Nothing yet');
    expect(empty).toContain('Add one');
    expect(html(h(ui.Notice, { tone: 'bad' }, 'Broken'))).toContain('role="alert"');
    expect(html(h(ui.Notice, { tone: 'info' }, 'Hint'))).toContain('role="status"');
  });

  it('Stat mutes a zero and prints a hyphen for a missing value', () => {
    expect(html(h(ui.Stat, { label: 'Winners', value: 0 }))).toMatch(/num[^"]*text-ink-soft/);
    expect(html(h(ui.Stat, { label: 'Winners', value: null }))).toContain('>-<');
    expect(html(h(ui.Stat, { label: 'Winners', value: 4, to: '/ads' }))).toMatch(/^<a[^>]*href="\/ads"/);
  });

  it('the grid recipes never go four across under 1800px', () => {
    expect(ui.GRID_CARDS).not.toMatch(/(^| )(md|lg|xl|2xl):grid-cols-4/);
    expect(ui.GRID_CARDS).toContain('min-[1800px]:grid-cols-4');
  });
});

describe('ui primitives for the info panel', () => {
  it('exports the new parts from ui/index next to every old one', () => {
    for (const name of ['KpiGroup', 'Delta', 'deltaSentence', 'StatusDot', 'ScrollRow', 'SectionNav', 'useHashScroll', 'GRID_HALVES', 'SECTION_ANCHOR']) {
      expect(ui[name], name).toBeDefined();
    }
    for (const name of ['Page', 'PageHeader', 'Panel', 'PanelLink', 'Section', 'Stat', 'Metrics', 'Badge', 'Segmented', 'GRID_CARDS', 'GRID_STATS', 'GRID_SPLIT', 'useMedia', 'useIsDesktop', 'LG_QUERY']) {
      expect(ui[name], name).toBeDefined();
    }
  });

  it('adds num-md to the type scale for key numbers', () => {
    expect(config.theme.extend.fontSize['num-md'][0]).toBe('1.375rem');
  });

  it('no primitive animates in: none uses an animation utility', () => {
    for (const file of ['Kpi.jsx', 'Delta.jsx', 'StatusDot.jsx', 'ScrollRow.jsx', 'SectionNav.jsx']) {
      expect(read(`src/components/ui/${file}`), file).not.toMatch(/animate-|@keyframes/);
    }
    for (const file of ['SplitBar.jsx', 'HeatStrip.jsx']) {
      expect(read(`src/components/charts/${file}`), file).not.toMatch(/animate-|transition/);
    }
  });
});
