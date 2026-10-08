import { useEffect, useState } from 'react';

// The breakpoint where the sidebar appears and filters become a popover.
export const LG_QUERY = '(min-width: 1024px)';

function matches(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

// True while the media query matches. Reads window only inside the hook, so
// importing this file in node is safe.
export function useMedia(query) {
  const [on, setOn] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(query);
    const update = () => setOn(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return on;
}

export const useIsDesktop = () => useMedia(LG_QUERY);
