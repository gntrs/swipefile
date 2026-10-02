import React, { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiStatus, buildBrief } from '@/lib/ai';
import AiNotice, { useAiStatus, statusProblem } from './AiNotice';

export const MAX_BRIEF_ADS = 20;
export const MAX_BRIEF_HOOKS = 50;

// Why the button cannot run for this selection, or null when it can.
export function briefBlocker(adIds = [], hooks = []) {
  const ads = Array.isArray(adIds) ? adIds.length : 0;
  const lines = Array.isArray(hooks) ? hooks.filter((h) => typeof h === 'string' && h.trim()).length : 0;
  if (!ads && !lines) return 'Select ads or hooks first.';
  if (ads > MAX_BRIEF_ADS) return `A brief takes up to ${MAX_BRIEF_ADS} ads. ${ads} are selected.`;
  if (lines > MAX_BRIEF_HOOKS) return `A brief takes up to ${MAX_BRIEF_HOOKS} hooks. ${lines} are selected.`;
  return null;
}

// Turns the selected ads or hooks into a brief, then opens it in Briefs.
export default function BriefFromSelection({ adIds = [], hooks = [], label = 'Brief from these', onDone, className = '' }) {
  const navigate = useNavigate();
  const { status, checking, recheck } = useAiStatus();
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState(null);
  const whyId = useId();
  const blocker = briefBlocker(adIds, hooks);

  const run = async () => {
    if (blocker || running) return;
    setProblem(null);
    const s = status || (await aiStatus());
    if (s.state !== 'ready') {
      setProblem({ ...statusProblem(s), fromStatus: true });
      return;
    }
    setRunning(true);
    const r = await buildBrief({ adIds, hooks: hooks.filter((h) => typeof h === 'string' && h.trim()) });
    setRunning(false);
    if (!r.ok) {
      setProblem(r);
      return;
    }
    onDone?.(r.brief);
    if (r.brief?.id) navigate(`/briefs?open=${encodeURIComponent(r.brief.id)}`);
    else navigate('/briefs');
  };

  const onRecheck = async () => {
    const s = await recheck();
    setProblem(s.state === 'ready' ? null : { ...statusProblem(s), fromStatus: true });
  };

  return (
    <div className={`inline-flex flex-col min-w-0 ${className}`}>
      <button
        type="button"
        onClick={run}
        disabled={Boolean(blocker) || running}
        aria-describedby={blocker ? whyId : undefined}
        className="press inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-4 rounded-xl bg-white/[0.06] text-[14px] font-semibold text-ink hover:bg-white/[0.1] transition-colors disabled:opacity-60 disabled:text-ink-soft"
      >
        {running ? 'Writing brief...' : label}
      </button>
      {blocker && (
        <p id={whyId} className="mt-1 text-[13px] leading-snug text-ink-soft">
          {blocker}
        </p>
      )}
      <AiNotice
        problem={problem}
        checking={checking}
        onRecheck={problem?.fromStatus && problem.code !== 'demo' ? onRecheck : undefined}
        onDismiss={() => setProblem(null)}
      />
    </div>
  );
}
