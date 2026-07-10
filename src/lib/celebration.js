// Optional "party mode": play a fullscreen meme video the moment a sale lands
// while a dashboard tab is open. Desktop only, and only while a tab is open (a
// closed browser tab runs no code). Toggle + Test button live on the Profile
// page. To disable entirely, remove <SaleCelebration/> from Layout.jsx.

const LS_KEY = 'celebrateSales';

// Meme registry. Drop your own clips in public/memes/ and list them here -
// `triggerCelebration()` picks one at RANDOM each sale (pass `{ memeId }` to
// force one). Ships with a couple of neutral samples; add whatever you like.
//
// NOTE: you are responsible for the rights to any media you add here. Don't
// commit clips you don't have the right to redistribute. See public/memes/README.md.
//
// Per-meme fields:
//   weight   relative pick odds (default 1) - higher = shows more often.
//   chroma   true  = key out a green-screen background (canvas). false = as-is.
//   loops    play the whole clip N times (good for short green-screen loops).
//   clip     play a RANDOM N-second slice each time (good for longer clips),
//            instead of looping. Uses the clip's own audio.
//   music    optional overlay track; if the file is missing the video's own
//            audio plays. musicStart = seconds into the track.
// Empty by default - the feature is dormant until you add at least one clip.
// Example entries (drop the files in public/memes/ and uncomment):
//
//   { id: 'clip', label: 'My clip', video: '/memes/clip.mp4', clip: 20 },
//   { id: 'loop', label: 'Green screen', video: '/memes/loop.mp4',
//     chroma: true, loops: 2, music: '/memes/track.mp3', musicStart: 0 },
export const MEMES = [];

// Weighted random meme (respects each meme's `weight`, default 1).
function pickWeighted() {
  const total = MEMES.reduce((s, m) => s + (m.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const m of MEMES) {
    r -= m.weight ?? 1;
    if (r < 0) return m;
  }
  return MEMES[MEMES.length - 1];
}

export function celebrationEnabled() {
  try {
    return localStorage.getItem(LS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setCelebrationEnabled(on) {
  try {
    localStorage.setItem(LS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

// Website only, never phones.
const isDesktop = () =>
  typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches;

// Fire the celebration. `force` (the Test button) bypasses the on/off setting
// but still respects desktop-only. A random meme plays unless `memeId` is
// given. Returns true if it will play.
export function triggerCelebration({ force = false, memeId } = {}) {
  if (!isDesktop()) return false;
  if (!force && !celebrationEnabled()) return false;
  const meme = memeId ? MEMES.find((m) => m.id === memeId) : pickWeighted();
  if (!meme) return false;
  window.dispatchEvent(new CustomEvent('sale-celebrate', { detail: { meme } }));
  return true;
}
