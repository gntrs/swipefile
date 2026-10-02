import { useEffect, useRef } from 'react';
import { LIBRARY_KEYS, shouldIgnoreKey, keyAction, isTypingTarget } from '@/lib/library/keys';

// Listens for the shortcut keys on the window and calls onAction(action,
// event) for each one that should fire. Typing in a field never fires a
// shortcut; Escape there just leaves the field. Pass DETAIL_KEYS as `map` for
// the ad page.
export default function useLibraryKeys(onAction, { map = LIBRARY_KEYS, enabled = true } = {}) {
  const handler = useRef(onAction);
  handler.current = onAction;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const onKey = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape' && isTypingTarget(event.target)) {
        event.target.blur?.();
        return;
      }
      if (shouldIgnoreKey(event)) return;
      const action = keyAction(map, event);
      if (!action) return;
      const handled = handler.current?.(action, event);
      if (handled !== false) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map, enabled]);
}
