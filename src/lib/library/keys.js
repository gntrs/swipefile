// Keyboard shortcuts for the library and the ad page. Pure: the hooks in
// src/features/save/ decide what each action does.

export const LIBRARY_KEYS = { '/': 'search', n: 'new', j: 'next', k: 'prev', Enter: 'open', x: 'select',
                              w: 'winner', l: 'loser', s: 'star', Escape: 'escape', '?': 'help' };
export const DETAIL_KEYS = { j: 'next', k: 'prev', w: 'winner', l: 'loser', s: 'star', Escape: 'back',
                             '#': 'delete', '?': 'help' };

// Keys that need Shift on most layouts, so Shift does not cancel them.
const SHIFT_KEYS = ['?', '#'];

// Help lines, in the order they are shown.
export const LIBRARY_HELP = [
  ['/', 'Search'],
  ['N', 'Add an ad'],
  ['J K', 'Next and previous ad'],
  ['Enter', 'Open the ad'],
  ['X', 'Select the ad'],
  ['W L', 'Mark winner or loser'],
  ['S', 'Star or unstar'],
  ['Esc', 'Clear the selection'],
  ['?', 'These keys'],
];
export const DETAIL_HELP = [
  ['J K', 'Next and previous ad in the list'],
  ['W L', 'Mark winner or loser'],
  ['S', 'Star or unstar'],
  ['#', 'Delete the ad'],
  ['Esc', 'Back to the list'],
  ['?', 'These keys'],
];

// A field the person is typing in.
export function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = String(target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable === true) return true;
  const ce = typeof target.getAttribute === 'function' ? target.getAttribute('contenteditable') : null;
  return ce !== null && ce !== undefined && ce !== 'false';
}

// True when a shortcut must not fire: typing in a field (Escape then only
// blurs it, which the hook does), a modifier held, an IME composing, or a
// dialog or sheet open other than the key help itself.
export function shouldIgnoreKey(event, doc = globalThis.document) {
  if (!event) return true;
  if (isTypingTarget(event.target)) return true;
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  if (event.isComposing || event.keyCode === 229) return true;
  if (doc && typeof doc.querySelector === 'function') {
    try {
      if (doc.querySelector('[role="dialog"], [data-sheet]:not([data-sheet="keys"])')) return true;
    } catch {
      return false;
    }
  }
  return false;
}

// The action for this key press in this map, or null.
export function keyAction(map, event) {
  if (!map || !event || typeof event.key !== 'string') return null;
  const key = event.key;
  if (!Object.prototype.hasOwnProperty.call(map, key)) return null;
  if (event.shiftKey && !SHIFT_KEYS.includes(key)) return null;
  return map[key];
}
