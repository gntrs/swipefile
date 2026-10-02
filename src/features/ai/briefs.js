// Pure helpers for the Briefs page and the dashboard card.

export const AI_AUTHOR = 'claude@analysis';

// Every source ad id across the given briefs, once each.
export function sourceIdsOf(briefs = []) {
  const ids = new Set();
  for (const b of briefs || []) {
    if (Array.isArray(b?.source_ad_ids)) for (const id of b.source_ad_ids) if (typeof id === 'string' && id) ids.add(id);
  }
  return [...ids];
}

// The chip text for a source ad: "Brand: hook", cut to a readable length.
export function sourceLabel(ad, max = 60) {
  if (!ad) return 'Deleted ad';
  const hook = typeof ad.hook === 'string' ? ad.hook.trim() : '';
  const brand = typeof ad.brand === 'string' ? ad.brand.trim() : '';
  const text = [brand, hook].filter(Boolean).join(': ') || 'Untitled ad';
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

// Who a brief is shown as. Team mode: the person who asked for it, else who
// added it, through displayName. Solo: AI for a generated brief, else nothing.
export function briefAuthor(brief, { teamMode, displayName = (e) => e } = {}) {
  if (!brief) return '';
  if (teamMode) {
    const email = brief.requested_by_email || brief.added_by_email;
    return email ? displayName(email) || '' : '';
  }
  return brief.added_by_email === AI_AUTHOR ? 'AI' : '';
}

// The first `n` non empty lines of a body, for previews.
export function firstLines(body, n = 3) {
  if (typeof body !== 'string') return '';
  return body
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .slice(0, n)
    .join('\n');
}

// Validates an edit or a new brief. -> { ok: true, title, body } | { ok: false, message }
export function checkDraft({ title, body } = {}) {
  const t = typeof title === 'string' ? title.trim() : '';
  const b = typeof body === 'string' ? body.trim() : '';
  if (!t && !b) return { ok: false, message: 'Give the brief a title and a body.' };
  if (!t) return { ok: false, message: 'Give the brief a title.' };
  if (!b) return { ok: false, message: 'The brief needs a body.' };
  if (t.length > 200) return { ok: false, message: 'Keep the title under 200 characters.' };
  return { ok: true, title: t, body: b };
}

// How many source ads a brief has, as text, or null.
export function sourceCountText(brief) {
  const n = Array.isArray(brief?.source_ad_ids) ? brief.source_ad_ids.length : 0;
  if (!n) return null;
  return n === 1 ? '1 source ad' : `${n} source ads`;
}
