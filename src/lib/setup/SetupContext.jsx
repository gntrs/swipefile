import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db, DB_CONFIG, DB_MODE } from '@/lib/db';
import { evaluate } from './checks.js';
import { runDoctor } from './doctor.js';

// Runs the setup check once when the app boots and shares the result. Demo
// and misconfigured modes are decided from the environment alone, without a
// network call; live mode asks the Supabase project.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const doctorEnv = { VITE_ALLOW_SIGNUP: env.VITE_ALLOW_SIGNUP };

const initial = DB_MODE === 'live' ? { status: 'ok', checks: [], loading: true } : { ...evaluate({ config: DB_CONFIG, env: doctorEnv }), loading: false };

const SetupContext = createContext({ ...initial, rerun: () => {} });
export const useSetup = () => useContext(SetupContext);

export function SetupProvider({ children }) {
  const [state, setState] = useState(initial);

  const rerun = useCallback(async () => {
    if (DB_MODE !== 'live') return;
    setState((s) => ({ ...s, loading: true }));
    const result = await runDoctor({ config: DB_CONFIG, db, env: doctorEnv });
    setState({ ...result, loading: false });
  }, []);

  useEffect(() => {
    rerun();
  }, [rerun]);

  const value = useMemo(() => ({ ...state, rerun }), [state, rerun]);
  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}
