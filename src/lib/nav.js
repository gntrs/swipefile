import {
  Binoculars,
  BookmarkSimple,
  CalendarBlank,
  ChartBar,
  ChartLineUp,
  Images,
  Megaphone,
  NotePencil,
  PaperPlaneTilt,
  Quotes,
  SquaresFour,
  Star,
  User,
} from '@phosphor-icons/react';
import { MODULES, FEATURE_READY, isTeamMode } from './modules.js';

// Every place the app can send you, as data. The desktop sidebar, the phone
// tab bar and the phone More sheet are all built from this list, filtered by
// the modules that are on (see modules.js).
//   module: the module that owns the destination
//   ready:  a FEATURE_READY key; the item stays hidden until that is true
//   match:  custom active test for items that live on another page's path
export const NAV_ITEMS = {
  dashboard: { id: 'dashboard', to: '/', label: 'Dashboard', short: 'Home', icon: SquaresFour, module: 'library', end: true },
  ads: { id: 'ads', to: '/ads', label: 'Ads', short: 'Ads', icon: Images, module: 'library' },
  insights: { id: 'insights', to: '/insights', label: 'Insights', short: 'Insights', icon: ChartBar, module: 'library' },
  hooks: { id: 'hooks', to: '/hooks', label: 'Hook bank', short: 'Hooks', icon: Quotes, module: 'hooks' },
  briefs: { id: 'briefs', to: '/briefs', label: 'Briefs', short: 'Briefs', icon: NotePencil, module: 'briefs' },
  posts: { id: 'posts', to: '/posts', label: 'Organic posts', short: 'Posts', icon: Megaphone, module: 'team' },
  competitors: { id: 'competitors', to: '/competitors', label: 'Competitors', short: 'Rivals', icon: Binoculars, module: 'competitors' },
  intel: { id: 'intel', to: '/intel', label: 'Market intel', short: 'Intel', icon: ChartLineUp, module: 'intel' },
  outreach: { id: 'outreach', to: '/outreach', label: 'Outreach', short: 'Reach', icon: PaperPlaneTilt, module: 'team' },
  availability: { id: 'availability', to: '/availability', label: 'Availability', short: 'When', icon: CalendarBlank, module: 'team' },
  capture: { id: 'capture', to: '/capture/setup', label: 'Capture', short: 'Capture', icon: BookmarkSimple, module: 'library', ready: 'capture' },
  // The shortlist is a destination, not a hidden chip state. It leads the More
  // sheet because it is the list people come back to.
  starred: {
    id: 'starred',
    to: '/ads?starred=1',
    label: 'Starred ads',
    short: 'Starred',
    icon: Star,
    module: 'library',
    match: (loc) => loc.pathname === '/ads' && loc.search.includes('starred=1'),
  },
  profile: { id: 'profile', to: '/profile', label: 'Profile', short: 'Profile', icon: User, module: 'library' },
};

// The two main areas (your insights, the competitors) come right after the
// library, in the sidebar and on the phone tabs alike. Hooks and Posts live in
// the More sheet on a phone.
const SIDEBAR_SOLO = ['dashboard', 'ads', 'insights', 'competitors', 'hooks', 'briefs', 'intel', 'capture'];
const SIDEBAR_TEAM = ['dashboard', 'ads', 'insights', 'competitors', 'hooks', 'briefs', 'posts', 'intel', 'outreach', 'availability', 'capture'];
const TABS_SOLO = ['dashboard', 'ads', 'insights', 'competitors'];
const TABS_TEAM = ['dashboard', 'ads', 'insights', 'competitors'];
// Where a tab whose module is off gets its replacement from, in this order.
const TAB_FILL = ['ads', 'insights', 'hooks', 'briefs', 'competitors', 'intel'];
const MORE_TEAM = ['starred', 'posts', 'hooks', 'briefs', 'intel', 'outreach', 'availability', 'profile', 'capture'];

function context({ modules = MODULES, teamMode, ready = FEATURE_READY } = {}) {
  return { modules, teamMode: teamMode ?? isTeamMode(modules), ready };
}

const shows = (item, { modules, ready }) => modules.has(item.module) && (!item.ready || Boolean(ready[item.ready]));
const pick = (ids, ctx) => ids.map((id) => NAV_ITEMS[id]).filter((item) => shows(item, ctx));

// Desktop sidebar, top to bottom.
export function sidebarItems(opts) {
  const ctx = context(opts);
  return pick(ctx.teamMode ? SIDEBAR_TEAM : SIDEBAR_SOLO, ctx);
}

// Phone tab bar, left to right (the More button follows them). A tab whose
// module is off gives its place to the next item from TAB_FILL that is on and
// not already a tab.
export function mobileTabs(opts) {
  const ctx = context(opts);
  const slots = (ctx.teamMode ? TABS_TEAM : TABS_SOLO).map((id) => (shows(NAV_ITEMS[id], ctx) ? id : null));
  const spare = TAB_FILL.filter((id) => !slots.includes(id) && shows(NAV_ITEMS[id], ctx));
  return slots
    .map((id) => id || spare.shift() || null)
    .filter(Boolean)
    .map((id) => NAV_ITEMS[id]);
}

// Phone More sheet, in order. Team mode keeps its long standing list; solo
// lists every sidebar item that is not a tab, Starred ads first, Profile last.
export function moreItems(opts) {
  const ctx = context(opts);
  const tabIds = new Set(mobileTabs(ctx).map((item) => item.id));
  const ids = ctx.teamMode
    ? MORE_TEAM
    : ['starred', ...SIDEBAR_SOLO.filter((id) => !tabIds.has(id)), 'profile'];
  return pick(ids.filter((id) => !tabIds.has(id)), ctx);
}
