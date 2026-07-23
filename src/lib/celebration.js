// Sale celebration ("party mode"). Fires a fullscreen celebration clip
// (+ optional music) the moment a sale lands while a dashboard tab is open.
// Web pages can't run while closed, so this only plays when a tab is open -
// that's a browser limit.
//
// Ships with an EMPTY clip registry: drop your own clips into public/memes/
// and list them below (see public/memes/README.md). If a listed file is
// missing or fails to load, the overlay dismisses itself - the confetti burst
// that accompanies a sale still fires either way.

const LS_KEY = 'celebrateSales';

// Clip registry. `triggerCelebration()` picks one at RANDOM each sale; pass
// `{ memeId }` to force a specific one.
//
// Per-clip fields:
//   weight   relative pick odds (default 1) - higher lands more often.
//   chroma   true  = key out the green screen (canvas). false = play as-is.
//   loops    play the whole clip N times (green-screen shorts).
//   clip     play a RANDOM N-second slice each time (long clips), instead of
//            looping. Uses the clip's own audio.
//   music    optional overlay track; if the file is missing the video's own
//            audio plays. musicStart = seconds into the track.
//
// Example entries:
//   { id: 'dance', label: 'Victory dance', video: '/memes/dance.mp4',
//     weight: 1, chroma: true, loops: 2,
//     music: '/memes/track.mp3', musicStart: 26 },
//   { id: 'movie', label: 'Movie moment', video: '/memes/movie.mp4',
//     weight: 7, chroma: false, clip: 20 },
export const MEMES = [];

// Weighted random pick (respects each clip's `weight`, default 1).
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

// Fire the celebration. `force` (the Test button) bypasses the on/off
// setting. Works on desktop AND phone - the Test tap is a user gesture, so
// mobile browsers allow playback with sound too. A random clip plays unless
// `memeId` is given. Returns true if it will play; false (a clean no-op)
// when the registry is empty or the feature is switched off.
export function triggerCelebration({ force = false, memeId } = {}) {
  if (!force && !celebrationEnabled()) return false;
  const meme = memeId ? MEMES.find((m) => m.id === memeId) : pickWeighted();
  if (!meme) return false;
  window.dispatchEvent(new CustomEvent('sale-celebrate', { detail: { meme } }));
  return true;
}
