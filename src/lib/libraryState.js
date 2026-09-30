// Which empty state the ad library shows. Pure, so it can be tested without
// rendering the page.
//   'first-run'  the swipe file has no ads at all and nothing is filtered
//   'no-match'   there are ads, or filters are on, but nothing matches
//   null         there is something to show
export function libraryEmptyState({ total = 0, shown = 0, filtersActive = false } = {}) {
  if (shown > 0) return null;
  if (total === 0 && !filtersActive) return 'first-run';
  return 'no-match';
}

// True when any Library filter narrows the list. `who` counts too: picking
// Rivals and then Clear filters must bring everything back.
export function anyFilterActive({ q = '', verdict = 'all', who = 'all', provenOnly, starredOnly, recentOnly, country = 'all', geo = 'all' } = {}) {
  return Boolean(
    provenOnly || starredOnly || recentOnly || verdict !== 'all' || who !== 'all' || country !== 'all' || geo !== 'all' || String(q).trim()
  );
}
