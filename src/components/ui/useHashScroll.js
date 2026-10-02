import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// A link like /insights#money lands on its section. The section is not on the
// page until the data is in, so this waits for `ready` and then scrolls once
// per hash. The section's scroll-mt (SECTION_ANCHOR) clears the sticky nav.
export function useHashScroll(ready) {
  const { pathname, hash } = useLocation();
  const done = useRef('');
  useEffect(() => {
    if (!ready || !hash || hash.length < 2) return;
    const key = `${pathname}${hash}`;
    if (done.current === key) return;
    let id = hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      return;
    }
    const el = typeof document === 'undefined' ? null : document.getElementById(id);
    if (!el) return;
    done.current = key;
    el.scrollIntoView({ block: 'start' });
  }, [ready, pathname, hash]);
}

export default useHashScroll;
