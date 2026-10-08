// Signing out has to end signed out. supabase-js keeps the session when the
// server call fails with anything but 401, 403 or 404 (offline, a paused
// project, a 5xx), even with scope 'local', which still calls the server. The
// login page then sends the still signed in user straight back into the app.
// So when the server call fails, this device forgets the session itself.
// Returns true when the server signed the session out, false when only this
// device did (the caller then clears its own user state).
export async function signOutWith(auth, storage = globalThis.localStorage) {
  let error = null;
  try {
    ({ error } = (await auth.signOut()) || {});
  } catch (e) {
    error = e;
  }
  if (!error) return true;
  try {
    storage?.removeItem(auth.storageKey);
    storage?.removeItem(`${auth.storageKey}-code-verifier`);
  } catch {
    // Storage can be blocked (private mode). The caller still clears its state.
  }
  return false;
}
