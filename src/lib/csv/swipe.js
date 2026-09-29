// The swipe file CSV: one ad per row, columns named in plain words. Header
// names are matched ignoring case, spaces, underscores and dashes, with the
// aliases below. Plain relative imports only, so Node can load it too.
import { VERDICTS, STATUSES } from '../ads.js';
import { parseAdLibraryInput } from '../adlibrary.js';

export const SWIPE_ALIASES = {
  brand: ['brand', 'advertiser', 'page', 'page name'],
  hook: ['hook', 'headline', 'title'],
  ad_copy: ['copy', 'ad copy', 'body', 'primary text', 'text'],
  landing_url: ['landing url', 'landing page', 'link', 'url', 'destination'],
  source_url: ['source url', 'ad link', 'ad library link', 'permalink'],
  ad_library_id: ['ad library id', 'library id'],
  platform: ['platform'],
  format: ['format'],
  verdict: ['verdict'],
  status: ['status'],
  tags: ['tags'],
  started: ['started', 'started running', 'start date'],
  days_running: ['days running', 'days'],
  countries: ['countries'],
};

export const headerKey = (h) => String(h ?? '').toLowerCase().replace(/[\s_-]+/g, '');

const ALIAS_INDEX = new Map();
for (const [field, names] of Object.entries(SWIPE_ALIASES)) {
  for (const n of names) ALIAS_INDEX.set(headerKey(n), field);
}

// Header row -> { field: column index } for every field the file has. The
// first column wins when two map to the same field.
export function swipeColumns(headers) {
  const col = {};
  (headers || []).forEach((h, i) => {
    const field = ALIAS_INDEX.get(headerKey(h));
    if (field && col[field] === undefined) col[field] = i;
  });
  return col;
}

// Looks like a swipe file: at least one column that says what the ad is.
export function isSwipeFile(headers) {
  const col = swipeColumns(headers);
  return ['brand', 'hook', 'ad_copy', 'source_url', 'ad_library_id'].some((f) => col[f] !== undefined);
}

export const splitList = (v) => {
  const out = [];
  for (const part of String(v ?? '').split(/[,;|]/)) {
    const s = part.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
};

const FORMATS = ['image', 'video'];
const ID_RE = /^\d{6,20}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(s) {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const isHttpUrl = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

// headers + data rows -> { ads, errors: [{ line, message }] }. line counts the
// header as line 1; pass `lines` (from parseCsvWithLines) when rows can span
// several lines. Every ad is a row ready for insert.
export function mapSwipeRows(headers, rows, { user = null, now = new Date(), lines = null } = {}) {
  const col = swipeColumns(headers);
  const ads = [];
  const errors = [];
  const nowIso = now.toISOString();
  (rows || []).forEach((r, i) => {
    const line = lines ? lines[i] : i + 2;
    const get = (field) => (col[field] === undefined ? '' : String(r[col[field]] ?? '').trim());
    const problems = [];

    const brand = get('brand');
    const hook = get('hook');
    const adCopy = get('ad_copy');
    const sourceRaw = get('source_url');
    if (!brand && !hook && !adCopy && !sourceRaw) {
      errors.push({ line, message: 'Needs a brand, hook, copy or ad link.' });
      return;
    }

    const verdictRaw = get('verdict').toLowerCase();
    if (verdictRaw && !VERDICTS.includes(verdictRaw)) {
      problems.push(`Verdict "${get('verdict')}" is not one of ${VERDICTS.join(', ')}.`);
    }
    const statusRaw = get('status').toLowerCase();
    if (statusRaw && !STATUSES.includes(statusRaw)) {
      problems.push(`Status "${get('status')}" is not one of ${STATUSES.join(', ')}.`);
    }
    const formatRaw = get('format').toLowerCase();
    if (formatRaw && !FORMATS.includes(formatRaw)) problems.push(`Format "${get('format')}" is not image or video.`);

    const metrics = { source: 'csv' };
    const parsed = sourceRaw ? parseAdLibraryInput(sourceRaw) : null;
    if (parsed) {
      metrics.ad_library_id = parsed.libraryId;
      metrics.ad_permalink = parsed.permalink;
      metrics.source_url = parsed.permalink;
    } else if (sourceRaw) {
      if (isHttpUrl(sourceRaw)) metrics.source_url = sourceRaw;
      else problems.push('Ad link is not a web address.');
    }
    const idRaw = get('ad_library_id');
    if (idRaw) {
      if (!ID_RE.test(idRaw)) problems.push('Ad library id must be 6 to 20 digits.');
      else if (parsed && parsed.libraryId !== idRaw) problems.push('Ad library id does not match the ad link.');
      else {
        metrics.ad_library_id = idRaw;
        if (!metrics.ad_permalink) {
          const p = parseAdLibraryInput(idRaw);
          metrics.ad_permalink = p.permalink;
          if (!metrics.source_url) metrics.source_url = p.permalink;
        }
      }
    }

    const started = get('started');
    if (started) {
      if (validDate(started)) metrics.started_running = started;
      else problems.push(`Start date "${started}" is not a date like 2026-09-29.`);
    }
    const daysRaw = get('days_running');
    if (daysRaw) {
      const d = Number(daysRaw);
      if (Number.isInteger(d) && d >= 0 && /^\d+$/.test(daysRaw)) metrics.days_running = d;
      else problems.push(`Days running "${daysRaw}" is not a whole number.`);
    }

    const landing = get('landing_url');
    if (landing && !isHttpUrl(landing)) problems.push('Landing url is not a web address.');

    if (problems.length) {
      errors.push({ line, message: problems.join(' ') });
      return;
    }

    const verdict = verdictRaw || 'unsure';
    // A verdict written in the file is a person's call: importers leave it.
    if (verdict !== 'unsure') {
      metrics.verdict_by = 'human';
      metrics.verdict_at = nowIso;
    }

    ads.push({
      brand: brand || null,
      platform: get('platform') || 'Facebook',
      format: formatRaw || 'image',
      hook: hook || null,
      ad_copy: adCopy || null,
      landing_url: landing || null,
      verdict,
      status: statusRaw || 'running',
      tags: splitList(get('tags')),
      countries: splitList(get('countries')).map((c) => c.toUpperCase()).filter((c, j, all) => all.indexOf(c) === j),
      metrics,
      media_path: null,
      added_by: user?.id ?? null,
      added_by_email: user?.email ?? null,
      _line: line,
    });
  });
  return { ads, errors };
}
