// Copies text to the clipboard. Resolves true when the browser took it and
// false when it did not: no clipboard API (a page served over plain http on
// another device), permission refused, or the tab not focused. Never throws,
// so a copy button can say what really happened instead of "Copied".
export async function copyText(text, clipboard = globalThis.navigator?.clipboard) {
  if (typeof text !== 'string' || text === '') return false;
  if (!clipboard || typeof clipboard.writeText !== 'function') return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
