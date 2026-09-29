import React, { useEffect, useState } from 'react';
import { Check, Copy, X } from '@phosphor-icons/react';
import { aiStatus, AI_FIX_COMMAND } from '@/lib/ai';

// The AI status for a component: read once on mount (cached for five minutes
// by the client), with `recheck` forcing a fresh read.
export function useAiStatus() {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    aiStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const recheck = async () => {
    setChecking(true);
    const s = await aiStatus({ force: true });
    setStatus(s);
    setChecking(false);
    return s;
  };

  return { status, ready: status?.state === 'ready', checking, recheck };
}

// A status state as a failure, so "not ready" and "the call failed" share one
// panel.
export const statusProblem = (status) =>
  status && status.state !== 'ready' ? { code: status.state, message: status.message } : null;

export function CopyCommand({ text }) {
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
      aria-label={copied ? 'Copied' : 'Copy the command'}
      className="press flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[14px] font-medium text-ink-soft hover:text-ink transition-colors"
    >
      {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
      <span>{failed ? 'Select it' : copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

// The inline panel for anything AI could not do: what happened, the command
// that fixes it when there is one, and a way to check again.
// problem: { code, message }
export default function AiNotice({ problem, onRecheck, checking = false, onDismiss, onRetry, retryLabel = 'Try again' }) {
  if (!problem) return null;
  const command = AI_FIX_COMMAND[problem.code];
  return (
    <div role="alert" className="mt-3 bg-white/[0.05] rounded-xl p-3 pl-4">
      <div className="flex items-start gap-2">
        <p className="flex-1 min-w-0 text-[15px] leading-relaxed text-ink pt-2.5">{problem.message}</p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="press flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-ink-soft hover:text-ink"
          >
            <X size={16} weight="bold" />
          </button>
        )}
      </div>
      {command && (
        <div className="mt-2 flex items-start gap-2">
          <code className="flex-1 min-w-0 block bg-canvas rounded-lg px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink whitespace-pre-wrap break-all">
            {command}
          </code>
          <CopyCommand text={command} />
        </div>
      )}
      {(onRecheck || onRetry) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="press inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-white/[0.06] text-[14px] font-semibold text-ink hover:bg-white/[0.1] transition-colors"
            >
              {retryLabel}
            </button>
          )}
          {onRecheck && (
            <button
              type="button"
              onClick={onRecheck}
              disabled={checking}
              className="press inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-white/[0.06] text-[14px] font-semibold text-ink-soft hover:text-ink transition-colors disabled:opacity-60"
            >
              {checking ? 'Checking...' : 'Check again'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
