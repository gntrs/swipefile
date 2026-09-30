// The three grid recipes every page uses. Plain strings so tailwind sees the
// classes when it scans this file.

// Cards: 1 on a phone, 2 from md, 3 from xl, 4 only from 1800px.
export const GRID_CARDS = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4 gap-4 lg:gap-6';

// Stat tiles: 2 by 2 on a phone, 4 across from lg.
export const GRID_STATS = 'grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6';

// A split page: children take lg:col-span-8 plus lg:col-span-4, or 7 plus 5.
export const GRID_SPLIT = 'grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6';
