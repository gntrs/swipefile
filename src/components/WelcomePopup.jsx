import React, { useState } from 'react';
import { HandWaving } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';

// First-open setup, shown until a nickname is saved. New members arrive with a
// temporary password from an admin, so this also makes them set their own.
// Supabase Auth stores only a bcrypt hash - the password never lands in our
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
      const { error: passErr } = await supabase.auth.updateUser({ password });
      if (passErr) throw passErr;
      const { error } = await supabase
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
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-5">
      <div className="bg-card rounded-xl3 border border-line shadow-card w-full max-w-[400px] p-6">
        <div className="flex items-center gap-2.5 mb-1.5">
          <HandWaving size={24} weight="bold" className="text-coral" />
          <h2 className="text-[18px] font-semibold tracking-tight">Welcome to the team</h2>
        </div>
        <p className="text-ink-soft text-[13px] mb-5">
          Two quick things before you dive in.
        </p>

        <form onSubmit={save}>
          <label className="text-[13px] font-semibold text-ink-soft mb-1 block">
            Your nickname
          </label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="How the team sees you"
            maxLength={30}
            autoFocus
            className="w-full py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[14px]"
          />

          <label className="text-[13px] font-semibold text-ink-soft mb-1 mt-4 block">
            Your own password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            className="w-full py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[14px]"
          />
          <p className="text-[12px] text-ink-soft mt-1.5">
            Replaces the temporary one you logged in with. Use it next time.
          </p>

          {err && <p className="text-[13px] text-coral-dark mt-3">{err}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full py-2.5 rounded-2xl bg-coral text-black font-semibold shadow-cta active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {busy ? 'Saving...' : "Let's go"}
          </button>
        </form>
      </div>
    </div>
  );
}
