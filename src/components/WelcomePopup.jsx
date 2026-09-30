import React, { useState } from 'react';
import { HandWaving } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { Button, Field, inputCls } from '@/components/ui';

// First-open setup, shown until a nickname is saved. New members arrive with a
// temporary password from an admin, so this also makes them set their own.
// The auth service stores only a bcrypt hash, so the password never lands in our
// tables or anywhere else.
export default function WelcomePopup() {
  const { user } = useAuth();
  const { me, refresh } = useTeam();

  const suggested = (user?.email?.split('@')[0].split(/[._-]/)[0] || '')
    .replace(/^./, (c) => c.toUpperCase());
  const [nickname, setNickname] = useState(suggested);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Only for members who have not set themselves up yet.
  if (!me || me.nickname) return null;

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    if (!nickname.trim()) return setErr('Pick a nickname first.');
    if (password.length < 8) return setErr('Password needs at least 8 characters.');
    setBusy(true);
    try {
      const { error: passErr } = await db.auth.updateUser({ password });
      if (passErr) throw passErr;
      const { error } = await db
        .from('team')
        .update({ nickname: nickname.trim() })
        .eq('id', user.id);
      if (error) throw error;
      await refresh(); // nickname now set -> popup unmounts
    } catch (e2) {
      setErr(e2.message || 'Could not save. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end lg:items-center justify-center lg:p-5 animate-fade">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="bg-card w-full lg:w-[28rem] max-h-[85dvh] overflow-y-auto rounded-t-2xl lg:rounded-xl3 lg:shadow-cardhover px-5 lg:px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:pb-6"
      >
        <div className="flex items-center gap-2.5">
          <HandWaving size={22} weight="bold" className="text-accent flex-shrink-0" aria-hidden="true" />
          <h2 id="welcome-title" className="text-title text-ink">
            Welcome to the team
          </h2>
        </div>
        <p className="text-body text-ink-soft mt-1 mb-5">Two quick things before you dive in.</p>

        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Your nickname" htmlFor="welcome-nickname">
            <input
              id="welcome-nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="How the team sees you"
              maxLength={30}
              autoFocus
              className={inputCls}
            />
          </Field>

          <Field
            label="Your own password"
            htmlFor="welcome-password"
            hint="Replaces the temporary one you logged in with. Use it next time."
          >
            <input
              id="welcome-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              aria-describedby="welcome-password-hint"
              className={inputCls}
            />
          </Field>

          {err && (
            <p role="alert" className="text-small text-red-300">
              {err}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={busy} className="w-full mt-1">
            {busy ? 'Saving...' : "Let's go"}
          </Button>
        </form>
      </div>
    </div>
  );
}
