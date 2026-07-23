import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';

// Self-signup is hidden by default: the team is added manually in the auth dashboard
// (Authentication -> Users) and public signup is disabled there. Set
// VITE_ALLOW_SIGNUP=1 only during first-time setup.
const ALLOW_SIGNUP = import.meta.env.VITE_ALLOW_SIGNUP === '1';

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (user) {
    navigate('/', { replace: true });
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      if (mode === 'signup') {
        const { error } = await db.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Account created. If email confirmation is on, check your inbox, then sign in.');
        setMode('signin');
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/', { replace: true });
      }
    } catch (err) {
      setMsg(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain flex items-center justify-center bg-cream px-5">
      <div className="w-full max-w-sm bg-card rounded-xl3 border border-line shadow-card p-7 animate-materialize">
        <p className="font-semibold text-[15px] tracking-tight mb-7">
          Tracker<span className="text-coral">.</span>
        </p>

        <h1 className="text-[24px] font-semibold tracking-tight mb-1">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-ink-soft text-[14px] mb-6">The team ad library.</p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full py-3 px-4 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full py-3 px-4 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream"
          />
          <button
            type="submit"
            disabled={busy}
            className="press w-full py-3 rounded-2xl bg-coral text-black font-semibold shadow-cta disabled:opacity-60"
          >
            {busy ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        {msg && <p className="mt-3 text-[13px] text-ink-soft">{msg}</p>}

        {ALLOW_SIGNUP ? (
          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="mt-4 text-[13px] text-coral-dark font-medium"
          >
            {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
        ) : (
          <p className="mt-4 text-[12px] text-ink-soft">
            Team accounts are added by the admin.
          </p>
        )}
      </div>
    </div>
  );
}
