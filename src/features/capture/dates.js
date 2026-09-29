// Running dates, shared by the capture page and scripts/track-longevity.mjs.
// No imports, so a script can load it without pulling in the app.

const DAY = 86400000;

const dayMs = (iso) => {
  if (typeof iso !== 'string') return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(t) ? t : null;
};

// Whole days from started to stopped, or to now while it still runs.
// null without a start date; never negative.
export function daysRunning(started, stopped, now = new Date()) {
  const from = dayMs(started);
  if (from === null) return null;
  const to = dayMs(stopped) ?? now.getTime();
  return Math.max(0, Math.floor((to - from) / DAY));
}

// started_running is an ISO timestamp elsewhere in the app (the importers
// write one), so a capture's day becomes midnight UTC.
export const startedIso = (day) => (day ? `${day}T00:00:00.000Z` : null);
