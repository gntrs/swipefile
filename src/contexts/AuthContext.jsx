import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { signOutWith } from '@/lib/signOut';

const AuthContext = createContext({ user: null, loading: true, signOut: () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // A failed session read (network down, bad project) must end the spinner
    // too: signed out is a state the app can show, loading forever is not.
    Promise.resolve()
      .then(() => db.auth.getSession())
      .then(({ data }) => {
        if (mounted) setUser(data?.session?.user ?? null);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // One sign out for the sidebar and the phone More sheet, see lib/signOut.js.
  const signOut = async () => {
    // Only this device signed out: no auth event will fire, so clear it here.
    if (!(await signOutWith(db.auth))) setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>
  );
}
