import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Info, Warning, XCircle, Copy, Check } from '@phosphor-icons/react';
import { DB_MODE } from '@/lib/db';
import { APP_NAME } from '@/lib/brand';
import { useSetup } from '@/lib/setup/SetupContext';

const LEVELS = {
  ok: { icon: CheckCircle, label: 'OK', tone: 'text-emerald-600' },
  info: { icon: Info, label: 'Info', tone: 'text-ink-soft' },
  warn: { icon: Warning, label: 'Warning', tone: 'text-amber-600' },
  fail: { icon: XCircle, label: 'Needs fixing', tone: 'text-red-600' },
};

const MODE_TEXT = {
  demo: 'No database is connected, so the app runs in demo mode on sample ads.',
  misconfigured: 'The database settings in .env are incomplete or wrong. The app stays on this page until they are fixed.',
  live: 'Connected to your Supabase project. Here is what the check found.',
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setFailed(true);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy the fix'}
      className="press flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-2xl border border-line text-[13px] font-medium text-ink-soft hover:text-ink"
    >
      {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
      <span className="hidden sm:inline">{failed ? 'Select it' : copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

function CheckRow({ check }) {
  const level = LEVELS[check.level] || LEVELS.info;
  const Icon = level.icon;
  return (
    <li className="py-4 border-b border-line last:border-b-0">
      <div className="flex items-start gap-3">
        <Icon size={22} weight="bold" className={`${level.tone} flex-shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-snug">{check.title}</p>
          <p className={`font-mono text-[11px] uppercase tracking-[0.12em] mt-1 ${level.tone}`}>{level.label}</p>
          {check.detail && <p className="text-[15px] text-ink-soft leading-relaxed mt-1.5">{check.detail}</p>}
          {check.fix && (
            <div className="mt-3 flex items-start gap-2">
              <code className="flex-1 min-w-0 block bg-cream border border-line rounded-2xl px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
                {check.fix}
              </code>
              <CopyButton text={check.fix} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default function Setup() {
  const { status, checks, loading, rerun } = useSetup();
  const blocking = status === 'blocking';

  return (
    <div data-page="setup" className="h-full overflow-y-auto overscroll-contain bg-cream text-ink">
      <div className="max-w-[720px] mx-auto px-5 sm:px-8 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <p className="font-semibold text-[18px] tracking-tight mb-8">
          {APP_NAME}
          <span className="text-coral">.</span>
        </p>

        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-ink-soft mb-2">Setup check</p>
        <h1 className="text-[26px] font-semibold tracking-tight leading-tight mb-3">
          {blocking ? 'Fix this before the app can start' : status === 'warn' ? 'Almost there' : 'Everything needed is in place'}
        </h1>
        <p className="text-[16px] text-ink-soft leading-relaxed mb-6">{MODE_TEXT[DB_MODE] || MODE_TEXT.live}</p>

        <div className="bg-card border border-line rounded-xl3 px-5">
          {loading && checks.length === 0 ? (
            <p className="py-5 text-[15px] text-ink-soft">Checking your project...</p>
          ) : (
            <ul>
              {checks.map((c, i) => (
                <CheckRow key={`${c.id}-${i}`} check={c} />
              ))}
              {/* Phase B adds <AiSetupRow /> and <CaptureSetupRow /> here. */}
            </ul>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {DB_MODE === 'live' && (
            <button
              type="button"
              onClick={rerun}
              disabled={loading}
              className="press inline-flex items-center justify-center min-h-[44px] px-5 rounded-2xl bg-coral text-black font-semibold disabled:opacity-60"
            >
              {loading ? 'Checking...' : 'Run again'}
            </button>
          )}
          {!blocking && (
            <Link
              to="/"
              className="press inline-flex items-center justify-center min-h-[44px] px-5 rounded-2xl border border-line font-semibold text-ink hover:bg-card"
            >
              Back to the app
            </Link>
          )}
        </div>
        {blocking && (
          <p className="mt-4 text-[14px] text-ink-soft leading-relaxed">
            After changing .env, stop npm run dev and start it again, then reload this page.
          </p>
        )}
      </div>
    </div>
  );
}
