import React, { useEffect, useState } from 'react';
import { CheckCircle, Info, Warning } from '@phosphor-icons/react';
import { aiStatus, AI_FIX_TEXT, AI_FIX_COMMAND } from '@/lib/ai';
import { Badge } from '@/components/ui';
import { CopyCommand } from './AiNotice';

const LEVELS = {
  ok: { icon: CheckCircle, label: 'OK', tone: 'text-emerald-400', badge: 'good' },
  info: { icon: Info, label: 'Info', tone: 'text-ink-soft', badge: 'neutral' },
  warn: { icon: Warning, label: 'Warning', tone: 'text-amber-400', badge: 'warn' },
};

// The setup row for a given AI status. Pure, for the tests.
export function aiSetupCheck(status) {
  if (!status) return { level: 'info', title: 'Checking AI...', detail: null, fix: null };
  switch (status.state) {
    case 'ready':
      return {
        level: 'ok',
        title: `AI ready: ${status.model}, up to ${status.batchLimit} ads per tagging run`,
        detail: null,
        fix: null,
      };
    case 'no_key':
      return {
        level: 'warn',
        title: 'ANTHROPIC_API_KEY is not set',
        detail: 'The ai function is deployed but has no Anthropic key, so every AI button shows this fix.',
        fix: AI_FIX_COMMAND.no_key,
      };
    case 'bad_key':
      return { level: 'warn', title: 'Anthropic rejected ANTHROPIC_API_KEY', detail: AI_FIX_TEXT.bad_key, fix: AI_FIX_COMMAND.bad_key };
    case 'not_deployed':
      return {
        level: 'info',
        title: 'AI is optional and not deployed',
        detail: 'Deploy the ai edge function to get why it works, angle tags and briefs from a selection.',
        fix: AI_FIX_COMMAND.not_deployed,
      };
    case 'demo':
      return { level: 'info', title: 'AI is off in demo mode', detail: AI_FIX_TEXT.demo, fix: null };
    case 'signed_out':
      return { level: 'info', title: 'Sign in to check AI.', detail: null, fix: null };
    case 'not_built':
      return { level: 'info', title: 'AI is not part of this build', detail: AI_FIX_TEXT.not_built, fix: null };
    default:
      return { level: 'warn', title: 'AI could not be checked', detail: status.message || null, fix: null };
  }
}

// One row in the setup check list, in the same markup as the doctor's rows.
export default function AiSetupRow() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let alive = true;
    aiStatus({ force: true }).then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const check = aiSetupCheck(status);
  const level = LEVELS[check.level] || LEVELS.info;
  const Icon = level.icon;
  return (
    <li className="px-5 lg:px-6 py-5" data-check="ai">
      <div className="flex items-start gap-3">
        <Icon size={20} weight="bold" className={`${level.tone} flex-shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-title text-ink min-w-0">{check.title}</p>
            <Badge tone={level.badge}>{level.label}</Badge>
          </div>
          {check.detail && <p className="text-body text-ink-soft mt-2 max-w-[68ch]">{check.detail}</p>}
          {check.fix && (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-start gap-2">
              <code className="flex-1 min-w-0 block bg-canvas rounded-xl p-3 font-mono text-small text-ink whitespace-pre-wrap break-words">
                {check.fix}
              </code>
              <CopyCommand text={check.fix} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
