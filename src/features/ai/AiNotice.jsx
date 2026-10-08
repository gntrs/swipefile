import React, { useEffect, useState } from 'react';
import { Check, Copy, X } from '@phosphor-icons/react';
import { aiStatus, AI_FIX_COMMAND } from '@/lib/ai';
import { Button, IconButton } from '@/components/ui';

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
    <Button
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy the command'}
      icon={copied ? Check : Copy}
      className="flex-shrink-0"
    >
      {failed ? 'Select it' : copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

// The inline panel for anything AI could not do: what happened, the command
// that fixes it when there is one, and a way to check again.
// problem: { code, message }
export default function AiNotice({ problem, onRecheck, checking = false, onDismiss, onRetry, retryLabel = 'Try again' }) {
  if (!problem) return null;
  const command = AI_FIX_COMMAND[problem.code];
  return (
    <div role="alert" className="mt-4 rounded-xl bg-white/[0.04] py-2 pl-4 pr-2">
      <div className="flex items-start gap-2">
        <p className="flex-1 min-w-0 text-ui text-ink py-2.5">{problem.message}</p>
        {onDismiss && <IconButton label="Dismiss" icon={X} onClick={onDismiss} />}
      </div>
      {command && (
        <div className="mt-1 mb-2 mr-2 flex flex-col sm:flex-row sm:items-start gap-2">
          <code className="flex-1 min-w-0 block bg-canvas rounded-xl p-3 font-mono text-small text-ink whitespace-pre-wrap break-words">
            {command}
          </code>
          <CopyCommand text={command} />
        </div>
      )}
      {(onRecheck || onRetry) && (
        <div className="mt-1 mb-2 flex flex-wrap gap-2">
          {onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
          {onRecheck && (
            <Button variant="ghost" onClick={onRecheck} disabled={checking} className="-ml-2">
              {checking ? 'Checking...' : 'Check again'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
