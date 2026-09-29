import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { db, IS_DEMO } from '@/lib/db';
import Wordmark from '@/components/Wordmark';
import { useAuth } from '@/contexts/AuthContext';
import { useSetup } from '@/lib/setup/SetupContext';

// Self signup is hidden by default: accounts are created with
// scripts/create-users.mjs and public signup is disabled in Supabase. Set
// VITE_ALLOW_SIGNUP=1 only during first time setup.
const ALLOW_SIGNUP = import.meta.env.VITE_ALLOW_SIGNUP === '1';

export default function Login() {
  const { user } = useAuth();
  const { status } = useSetup();
  const navigate = useNavigate();
  const location = useLocation();
  // Where Protected was sending the visitor before it asked them to sign in.
  const from = location.state?.from;
  const target = from?.pathname ? `${from.pathname}${from.search || ''}` : '/';
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Already signed in (or demo mode, where there is nothing to sign in to).
  useEffect(() => {
    if (user || IS_DEMO) navigate(target, { replace: true });
  }, [user, navigate, target]);

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
        navigate(target, { replace: true });
      }
    } catch (err) {
      setMsg(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-page="login" className="h-full overflow-y-auto overscroll-contain flex items-center justify-center bg-canvas px-5">
      <div className="w-full max-w-sm py-10 animate-materialize">
        <p className="mb-12 min-h-[44px] flex items-center">
          <Wordmark />
        </p>

        <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-[1.1] mb-2">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-ink-soft text-[16px] mb-8">Your ad swipe file.</p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            aria-label="Email"
            className="w-full min-h-[48px] py-3 px-4 rounded-xl border border-line focus:outline-none focus:border-accent bg-card text-[16px] placeholder:text-ink-soft/70"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className="w-full min-h-[48px] py-3 px-4 rounded-xl border border-line focus:outline-none focus:border-accent bg-card text-[16px] placeholder:text-ink-soft/70"
          />
          <button
            type="submit"
            disabled={busy}
            className="press w-full min-h-[48px] mt-1 py-3 rounded-xl bg-accent text-black text-[16px] font-semibold hover:bg-accent-dim transition-colors disabled:opacity-60"
          >
            {busy ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        {msg && <p role="status" className="mt-4 text-[15px] leading-relaxed text-ink">{msg}</p>}

        {ALLOW_SIGNUP ? (
          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="mt-4 min-h-[44px] px-1 -ml-1 rounded-xl text-[15px] text-ink font-medium underline underline-offset-4 decoration-ink-soft hover:decoration-ink"
          >
            {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
        ) : (
          <p className="mt-6 text-[14px] leading-relaxed text-ink-soft">
            Accounts are created with <span className="font-mono text-[13px] text-ink">scripts/create-users.mjs</span>.
          </p>
        )}

        {status !== 'ok' && (
          <Link
            to="/setup"
            className="mt-2 -ml-1 px-1 rounded-xl inline-flex items-center min-h-[44px] text-[14px] font-medium text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Setup check
          </Link>
        )}
      </div>
    </div>
  );
}
