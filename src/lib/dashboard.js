// The numbers behind the main dashboard, as one pure function so the page stays
// a layout and the rules can be tested without a browser.
import { angleOf, angleLabel } from './angles.js';

const DAY = 86400000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const createdAt = (ad) => {
  const t = Date.parse(ad?.created_at || '');
  return Number.isFinite(t) ? t : null;
};

// Live when the importer says so. A row with no live flag falls back to its
// status, the same rule the verdict scorer uses.
export const isRunning = (ad) => {
  const live = ad?.metrics?.live;
  return typeof live === 'boolean' ? live : ad?.status === 'running';
};

export const isWinner = (ad) => ad?.verdict === 'winner';

// One ad per id, first one wins, rows without an object dropped. A list that
// arrives twice (a retry, a realtime echo) never counts double.
function clean(ads) {
  if (!Array.isArray(ads)) return [];
  const seen = new Set();
  const out = [];
  for (const ad of ads) {
    if (!ad || typeof ad !== 'object') continue;
    if (ad.id != null) {
      if (seen.has(ad.id)) continue;
      seen.add(ad.id);
    }
    out.push(ad);
  }
  return out;
}

// The short proof shown next to a winner: how long it ran, or what it returned.
export function winnerProof(ad) {
  const m = ad?.metrics || {};
  const days = num(m.days_running);
  if (days != null && days > 0) return isRunning(ad) ? `live ${days}d` : `ran ${days}d`;
  const roas = num(m.roas);
  if (roas != null && roas > 0) return `ROAS ${roas.toFixed(1)}`;
  const ctr = num(m.ctr);
  if (ctr != null && ctr > 0) return `CTR ${ctr.toFixed(1)}%`;
  return null;
}

// Winners that are still running first, then the longest runs, then own ads by
// return. Ties keep the newest first.
function rankWinners(a, b) {
  const la = isRunning(a) ? 1 : 0;
  const lb = isRunning(b) ? 1 : 0;
  if (la !== lb) return lb - la;
  const da = num(a.metrics?.days_running) ?? -1;
  const dbb = num(b.metrics?.days_running) ?? -1;
  if (da !== dbb) return dbb - da;
  const ra = num(a.metrics?.roas) ?? -1;
  const rb = num(b.metrics?.roas) ?? -1;
  if (ra !== rb) return rb - ra;
  return (createdAt(b) ?? 0) - (createdAt(a) ?? 0);
}

export function dashboardSummary(input, { now = Date.now(), isOwn = () => false, top = 5 } = {}) {
  const ads = clean(input);
  const weekAgo = now - 7 * DAY;
  const monthAgo = now - 30 * DAY;
  const isNew = (ad, since) => {
    const t = createdAt(ad);
    return t != null && t >= since && t <= now + DAY;
  };

  const winners = ads.filter(isWinner);

  const angleCounts = new Map();
  let noAngle = 0;
  for (const ad of winners) {
    const id = angleOf(ad);
    if (id) angleCounts.set(id, (angleCounts.get(id) || 0) + 1);
    else noAngle += 1;
  }
  const angles = [...angleCounts.entries()]
    .map(([id, count]) => ({ id, label: angleLabel(id), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const byBrand = new Map();
  for (const ad of ads) {
    const brand = String(ad.brand || '').trim();
    if (!brand || isOwn(brand)) continue;
    const row = byBrand.get(brand) || { brand, running: 0, fresh: 0, total: 0 };
    row.total += 1;
    if (isRunning(ad)) row.running += 1;
    if (isNew(ad, monthAgo)) row.fresh += 1;
    byBrand.set(brand, row);
  }
  const rivals = [...byBrand.values()]
    .filter((r) => r.running > 0 || r.fresh > 0)
    .sort((a, b) => b.running - a.running || b.fresh - a.fresh || a.brand.localeCompare(b.brand))
    .slice(0, top);

  return {
    total: ads.length,
    winners: winners.length,
    running: ads.filter(isRunning).length,
    newThisWeek: ads.filter((ad) => isNew(ad, weekAgo)).length,
    working: [...winners].sort(rankWinners).slice(0, top),
    angles,
    noAngle,
    rivals,
  };
}

// ---------------------------------------------------------------------------
// The info panel: key numbers, the things to act on, and the links one tap
// deeper. Pure, `now` passed in, built on the rival and insight rules so the
// dashboard and the deep pages always print the same numbers.
import { VERDICT_RULES, geoStatus } from './ads.js';
import { ownAdsSummary, libraryCounts } from './insights.js';
import { rivalAds, rivalKpis, provenPlays, brandSlug } from './rivals.js';
import { formatMoneyShort, formatPct, currencySymbol } from './format.js';

const PERIOD_POINT = 'now against 30 days ago';
const PERIOD_WINDOW = 'the last 30 days against the 30 before';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A number from a number or numeric string; null, blanks and booleans are
// unknown, not zero.
const val = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' ? null : num(v));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ownFn = (isOwn) => (typeof isOwn === 'function' ? isOwn : () => false);
const nowMs = (now) => {
  const t = typeof now === 'number' ? now : Date.parse(now ?? '');
  return Number.isFinite(t) ? t : Date.now();
};

// Money in a sentence: whole amounts without cents (€95, €240), anything else
// the key number rule (€18.50, €12.4k).
export function moneyText(n, currency = 'eur') {
  const v = val(n);
  if (v === null) return '-';
  const r = Math.round(v * 100) / 100;
  if (Number.isInteger(r) && Math.abs(r) < 10000) {
    return `${r < 0 ? '-' : ''}${currencySymbol(currency)}${Math.abs(r).toLocaleString('en-US')}`;
  }
  return formatMoneyShort(v, currency);
}

const statusFoot = (band) => band && { kind: 'status', tone: band.tone, word: band.label };
const textFoot = (text) => ({ kind: 'text', text });

function ownCells(own) {
  const cur = own.currency;
  const cells = [
    {
      id: 'spend',
      label: 'Spend',
      value: own.totalSpend,
      display: formatMoneyShort(own.totalSpend, cur),
      to: '/insights#money',
      foot: textFoot(plural(own.rows.length, 'ad')),
      srText: null,
    },
    own.roas.value != null && {
      id: 'roas',
      label: 'ROAS',
      value: own.roas.value,
      display: own.roas.value.toFixed(2),
      to: '/insights#money',
      foot: statusFoot(own.roasBand),
      srText: own.roasBand ? `${own.roasBand.basis}, on ${plural(own.roas.ads, 'ad')}` : null,
    },
    own.blendedCtr != null && {
      id: 'ctr',
      label: 'CTR',
      value: own.blendedCtr,
      display: formatPct(own.blendedCtr),
      to: '/insights#ads',
      foot: statusFoot(own.ctrBand),
      srText: own.ctrBand ? own.ctrBand.basis : null,
    },
    own.blendedCpc != null && {
      id: 'cpc',
      label: 'CPC',
      value: own.blendedCpc,
      display: formatMoneyShort(own.blendedCpc, cur),
      to: '/insights#ads',
      foot: textFoot(plural(own.cpcAds, 'ad')),
      srText: null,
    },
  ];
  return cells.filter(Boolean).slice(0, 3);
}

function libraryCells(ads, now) {
  const lib = libraryCounts(ads, { now });
  return [
    {
      id: 'saved',
      label: 'Saved, 30d',
      value: lib.saved.value,
      display: String(lib.saved.value ?? '-'),
      to: '/ads',
      foot: lib.saved.delta ? { kind: 'delta', delta: lib.saved.delta, period: PERIOD_WINDOW } : null,
      srText: null,
    },
    {
      id: 'winners',
      label: 'Winners',
      value: lib.winners,
      display: String(lib.winners),
      to: '/ads?verdict=winner',
      foot: textFoot(`${lib.winnersLive} still live`),
      srText: null,
    },
    {
      id: 'starred',
      label: 'Starred',
      value: lib.starred,
      display: String(lib.starred),
      to: '/ads?starred=1',
      foot: textFoot('shortlist'),
      srText: null,
    },
  ];
}

function rivalCells(ads, isOwn, now) {
  const k = rivalKpis(ads, { isOwn, now, days: 30 });
  const anyDated = k.running.dated > 0;
  const deltaFoot = (delta, period) => (delta ? { kind: 'delta', delta, period } : null);
  let runningFoot;
  if (!anyDated) runningFoot = textFoot('no start dates yet');
  else if (!k.running.comparable) runningFoot = textFoot(`no start dates on ${plural(k.running.undatedRunning, 'ad')}`);
  else runningFoot = deltaFoot(k.running.delta, PERIOD_POINT);
  const cell = (id, label, value, to, foot) => ({ id, label, value, display: String(value), to, foot, srText: null });
  return [
    cell('running', 'Running now', k.running.value, '/competitors#activity', runningFoot),
    cell('launched', 'New, 30d', k.launched.value, '/competitors#plays',
      anyDated ? deltaFoot(k.launched.delta, PERIOD_WINDOW) : textFoot('no start dates yet')),
    cell('proven', 'Live 60d+', k.provenLive.value, '/competitors#plays',
      anyDated ? deltaFoot(k.provenLive.delta, PERIOD_POINT) : textFoot('no start dates yet')),
  ];
}

// The two key number groups. "Your ads" when your brand is set and your ads
// carry spend (totals as imported, so a band or a count, never a change),
// else "Your library". "Rivals" only with the competitors module on and at
// least one rival ad.
export function topMetrics({ ads, isOwn, ownBrandSet = true, now = Date.now(), competitorsOn = true } = {}) {
  const t = nowMs(now);
  const own = ownFn(isOwn);
  const list = clean(ads);
  const summary = ownBrandSet ? ownAdsSummary(list, { isOwn: own }) : null;
  const you = summary?.hasNumbers
    ? { id: 'ads', title: 'Your ads', meta: 'as imported, no history', cells: ownCells(summary) }
    : { id: 'library', title: 'Your library', meta: 'vs 30 days ago', cells: libraryCells(list, t) };
  const rivals =
    competitorsOn && rivalAds(list, own).length
      ? { title: 'Rivals', meta: 'vs 30 days ago', cells: rivalCells(list, own, t) }
      : null;
  return { you, rivals };
}

const adName = (ad) => ad?.metrics?.ad_name || ad?.hook || 'Untitled ad';
const isOwnWithSpend = (own) => (ad) => own(ad?.brand) && val(ad?.metrics?.spend) !== null;
const currencyOf = (ad) => (typeof ad?.metrics?.currency === 'string' && ad.metrics.currency.trim() ? ad.metrics.currency.trim().toLowerCase() : 'eur');

// What to do next, most urgent first: a loser still spending, the best own
// winner to build on, a test with too little spend to read, a rival ad that
// just passed 60 days live, winners with no angle. Each kind once at most.
export function nextActions({ ads, isOwn, now = Date.now(), limit = 2 } = {}) {
  const t = nowMs(now);
  const own = ownFn(isOwn);
  const list = clean(ads);
  const mine = list.filter(isOwnWithSpend(own));
  const out = [];
  const spendOf = (ad) => val(ad.metrics.spend) ?? 0;

  const losing = mine
    .filter((a) => a.verdict === 'loser' && isRunning(a) && spendOf(a) >= VERDICT_RULES.OWN_KILL_SPEND)
    .sort((a, b) => spendOf(b) - spendOf(a))[0];
  if (losing) {
    const m = losing.metrics;
    const roas = val(m.roas);
    const ctr = val(m.ctr);
    const read = roas !== null ? `ROAS ${roas.toFixed(1)}` : ctr !== null ? `CTR ${ctr.toFixed(1)}%` : null;
    const spent = `${moneyText(spendOf(losing), currencyOf(losing))} spent`;
    out.push({
      id: 'losing-running',
      tone: 'bad',
      word: 'Losing',
      title: `${adName(losing)} is losing and still running`,
      detail: read ? `${read} on ${spent}` : spent,
      to: `/ad/${losing.id}`,
    });
  }

  const best = mine
    .filter((a) => a.verdict === 'winner')
    .sort(
      (a, b) =>
        (val(b.metrics.roas) ?? -1) - (val(a.metrics.roas) ?? -1) || (val(b.metrics.ctr) ?? -1) - (val(a.metrics.ctr) ?? -1),
    )[0];
  if (best) {
    const m = best.metrics;
    const roas = val(m.roas);
    const ctr = val(m.ctr);
    const money = moneyText(spendOf(best), currencyOf(best));
    const read = roas !== null ? `ROAS ${roas.toFixed(1)} on ${money}` : ctr !== null ? `CTR ${ctr.toFixed(1)}% on ${money}` : `${money} spent`;
    const angle = angleOf(best);
    out.push({
      id: 'winner-build',
      tone: 'good',
      word: 'Winning',
      title: `${adName(best)} is your best ad`,
      detail: `${read}${angle ? `, ${angleLabel(angle)}` : ''}. Brief a variation.`,
      to: `/ad/${best.id}`,
    });
  }

  const noRead = mine
    .filter((a) => a.verdict === 'testing' && isRunning(a) && spendOf(a) < VERDICT_RULES.OWN_MIN_SPEND)
    .sort((a, b) => spendOf(b) - spendOf(a))[0];
  if (noRead) {
    const cur = currencyOf(noRead);
    out.push({
      id: 'no-read',
      tone: 'warn',
      word: 'No read yet',
      title: `${adName(noRead)} has too little spend to read`,
      detail: `${moneyText(spendOf(noRead), cur)} spent, a read needs ${moneyText(VERDICT_RULES.OWN_MIN_SPEND, cur)}`,
      to: `/ad/${noRead.id}`,
    });
  }

  const fresh = provenPlays(list, { isOwn: own, now: t })
    .filter((p) => p.newlyProven)
    .sort((a, b) => a.days - b.days)[0];
  if (fresh) {
    const brand = String(fresh.ad.brand).trim();
    out.push({
      id: 'rival-proven',
      tone: 'good',
      word: 'Newly proven',
      title: `${brand} has kept one ad live for ${fresh.days} days`,
      detail: fresh.ad.hook ? `"${fresh.ad.hook}"` : 'Past 60 days live, worth a look',
      to: `/ad/${fresh.ad.id}`,
      slug: brandSlug(brand),
    });
  }

  const untagged = list.filter((a) => isWinner(a) && !angleOf(a)).length;
  if (untagged) {
    out.push({
      id: 'untagged-winners',
      tone: 'neutral',
      word: 'Untagged',
      title: `${untagged === 1 ? '1 winner has' : `${untagged} winners have`} no angle yet`,
      detail: 'Tag the angle so it counts in the angle split',
      to: '/ads?verdict=winner',
    });
  }

  const n = Number.isInteger(limit) && limit >= 0 ? limit : 2;
  return out.slice(0, n);
}

const moduleOn = (modules) => {
  if (typeof modules === 'function') return modules;
  if (modules instanceof Set) return (id) => modules.has(id);
  if (Array.isArray(modules)) return (id) => modules.includes(id);
  return () => false;
};

const dayMonth = (value) => {
  const t = Date.parse(value ?? '');
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

// The tiles one tap deeper, each with one fact. Insights always, the rest per
// module.
export function deepLinks({ ads, isOwn, modules, latestBrief = null, now = Date.now() } = {}) {
  const t = nowMs(now);
  const own = ownFn(isOwn);
  const on = moduleOn(modules);
  const list = clean(ads);
  const out = [];

  const summary = ownAdsSummary(list, { isOwn: own });
  const winners = list.filter(isWinner).length;
  out.push({
    id: 'insights',
    to: '/insights',
    label: 'Insights',
    fact: summary.hasNumbers
      ? `${plural(summary.rows.length, 'ad')}, ${summary.rows.filter((r) => r.verdict === 'winner').length} winning`
      : plural(winners, 'winner'),
  });

  if (on('competitors')) {
    const rivals = rivalAds(list, own);
    const running = rivals.length ? rivalKpis(list, { isOwn: own, now: t }).brandsRunning : 0;
    out.push({
      id: 'competitors',
      to: '/competitors',
      label: 'Competitors',
      fact: !rivals.length ? 'No rival tracked yet' : running ? `${plural(running, 'rival')} running ads` : 'No rival running ads',
    });
  }

  if (on('intel')) {
    const eu = list.filter((a) => geoStatus(a) === 'eu').length;
    out.push({
      id: 'intel',
      to: '/intel',
      label: 'Market intel',
      fact: eu ? `${plural(eu, 'ad')} ran in the EU` : 'Search ranks and demand',
    });
  }

  if (on('hooks')) {
    const hooks = list.filter((a) => typeof a.hook === 'string' && a.hook.trim());
    const tagged = hooks.filter((a) => angleOf(a)).length;
    out.push({
      id: 'hooks',
      to: '/hooks',
      label: 'Hook bank',
      fact: hooks.length ? `${plural(hooks.length, 'hook')}, ${tagged} with an angle` : 'No hooks yet',
    });
  }

  if (on('briefs')) {
    const date = dayMonth(latestBrief?.created_at);
    out.push({ id: 'briefs', to: '/briefs', label: 'Briefs', fact: date ? `Latest ${date}` : 'No brief yet' });
  }

  return out;
}

