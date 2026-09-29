import React, { useState } from 'react';
import { aiStatus, analyzeAd } from '@/lib/ai';
import { angleLabel } from '@/lib/angles';
import AiNotice, { useAiStatus, statusProblem } from './AiNotice';
import { shortDate } from './dates';

function Field({ label, children }) {
  return (
    <div>
      <p className="kicker mb-1">{label}</p>
      <div className="text-[16px] leading-relaxed whitespace-pre-wrap">{children}</div>
    </div>
  );
}

const primary =
  'press inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-accent text-black text-[14px] font-semibold hover:bg-accent-dim transition-colors disabled:opacity-60';
const secondary =
  'press inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-white/[0.06] text-[14px] font-semibold text-ink hover:bg-white/[0.1] transition-colors disabled:opacity-60';

// "Why it works" on the ad page: the AI read of one ad, or a button to get it.
// When AI is not ready the button stays and pressing it shows the fix.
export default function WhyItWorks({ ad, onAdChange }) {
  const { status, checking, recheck } = useAiStatus();
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState(null);
  if (!ad) return null;
  const ai = ad.metrics?.ai && typeof ad.metrics.ai === 'object' ? ad.metrics.ai : null;

  const run = async () => {
    setProblem(null);
    const s = status || (await aiStatus());
    if (s.state !== 'ready') {
      setProblem({ ...statusProblem(s), fromStatus: true });
      return;
    }
    setRunning(true);
    const r = await analyzeAd(ad.id);
    setRunning(false);
    if (r.ok) onAdChange?.(r.ad);
    else setProblem(r);
  };

  const onRecheck = async () => {
    const s = await recheck();
    setProblem(s.state === 'ready' ? null : { ...statusProblem(s), fromStatus: true });
  };

  const ideas = Array.isArray(ai?.remix_ideas) ? ai.remix_ideas.filter((x) => typeof x === 'string' && x.trim()) : [];
  const when = ai?.analyzed_at ? shortDate(ai.analyzed_at) : null;
  const byLine = ai
    ? ai.model === 'sample'
      ? `Sample analysis${when ? `, ${when}` : ''}`
      : `Analyzed${when ? ` ${when}` : ''}${ai.model ? ` with ${ai.model}` : ''}`
    : null;

  return (
    <section aria-labelledby="why-it-works" className="pt-6 mt-1 border-t border-line">
      <h2 id="why-it-works" className="text-[20px] font-semibold tracking-[-0.02em] leading-tight mb-5">
        Why it works
      </h2>

      {ai ? (
        <div className="flex flex-col gap-4">
          {ai.hook && <Field label="Hook">{ai.hook}</Field>}
          {ai.angle && <Field label="Angle">{angleLabel(ai.angle) || ai.angle}</Field>}
          {ai.format && <Field label="Format">{ai.format}</Field>}
          {ai.audience && <Field label="Audience">{ai.audience}</Field>}
          {ai.why_it_works && <Field label="Why it works">{ai.why_it_works}</Field>}
          {ai.weaknesses && <Field label="Weak spots">{ai.weaknesses}</Field>}
          {ideas.length > 0 && (
            <Field label="Remix ideas">
              <ol className="flex flex-col gap-1.5">
                {ideas.map((idea, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-[13px] text-ink-soft tabular-nums pt-[3px]">{i + 1}.</span>
                    <span className="min-w-0">{idea}</span>
                  </li>
                ))}
              </ol>
            </Field>
          )}
          {byLine && <p className="font-mono text-[12px] text-ink-soft pt-1">{byLine}</p>}
          <div>
            <button type="button" onClick={run} disabled={running} className={secondary}>
              {running ? 'Analyzing...' : 'Analyze again'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[16px] leading-relaxed text-ink-soft mb-4">
            Get a plain read of this ad: its hook, angle, audience, why it could work, where it is weak, and ideas to remix it.
          </p>
          <button type="button" onClick={run} disabled={running} className={primary}>
            {running ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      )}

      <AiNotice
        problem={problem}
        checking={checking}
        onRecheck={problem?.fromStatus && problem.code !== 'demo' ? onRecheck : undefined}
        onRetry={problem && !problem.fromStatus ? run : undefined}
        onDismiss={() => setProblem(null)}
      />
    </section>
  );
}
