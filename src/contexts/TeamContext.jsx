import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { db, isMissingTable } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';

let warned = false;
function warnOnce(message) {
  if (warned) return;
  warned = true;
  console.warn(message);
}

// Team profiles (nickname + avatar). Loaded once for everyone so any component
// can resolve an email to a friendly display name and a profile picture.
const TeamContext = createContext({
  members: [],
  me: null,
  isAdmin: false,
  displayName: (email) => email,
  avatarFor: () => null,
  mentionables: [],
  refresh: () => {},
});
export const useTeam = () => useContext(TeamContext);

// Turn a display name into a short lowercase @-token: letters/digits only, so
// "Ann-Marie" becomes "annmarie". Collisions get a numeric suffix (rare, two
// people with the exact same name).
function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function TeamProvider({ children }) {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);

  const refresh = useCallback(async () => {
    const { data, error } = await db.from('team').select('*');
    if (error) {
      // No team table yet (db-setup.sql not run): stay empty and quiet.
      if (!isMissingTable(error)) warnOnce(`[team] load failed: ${error.message}`);
      setMembers([]);
      return;
    }
    setMembers(data || []);
  }, []);

  useEffect(() => {
    if (!user) {
      setMembers([]);
      return;
    }
    // Ensure my own row exists (first login), then load everyone.
    (async () => {
      try {
        const { error } = await db.from('team').upsert({ id: user.id, email: user.email }, { onConflict: 'id' });
        if (error && !isMissingTable(error)) warnOnce(`[team] profile row failed: ${error.message}`);
      } catch (err) {
        warnOnce(`[team] profile row failed: ${err?.message || err}`);
      }
      refresh();
    })();
  }, [user, refresh]);

  const byEmail = new Map(members.map((m) => [m.email, m]));
  const me = user ? members.find((m) => m.id === user.id) || null : null;
  // Role only unlocks extra UI (the pen). It is set with the service key
  // (scripts/create-users.mjs), never from the app.
  const isAdmin = me?.role === 'admin';

  const displayName = (email) => {
    if (!email) return '';
    if (email === 'claude@analysis') return 'Claude';
    const m = byEmail.get(email);
    return m?.nickname?.trim() || email.split('@')[0];
  };

  const avatarFor = (email) => {
    const m = byEmail.get(email);
    return m?.avatar_path || null;
  };

  // Everyone taggable with @: the team plus Claude. Slugs are computed here so
  // the chat compose box, the message renderer, and scripts/chat.mjs all agree
  // on the same @token for the same person.
  const mentionables = (() => {
    const list = [
      { email: 'claude@analysis', label: 'Claude' },
      ...members.map((m) => ({ email: m.email, label: m.nickname?.trim() || m.email.split('@')[0] })),
    ];
    const used = new Set();
    return list.map((entry) => {
      let slug = slugify(entry.label) || slugify(entry.email.split('@')[0]);
      let unique = slug;
      let i = 2;
      while (used.has(unique)) unique = `${slug}${i++}`;
      used.add(unique);
      return { ...entry, slug: unique };
    });
  })();

  return (
    <TeamContext.Provider value={{ members, me, isAdmin, displayName, avatarFor, mentionables, refresh }}>
      {children}
    </TeamContext.Provider>
  );
}
