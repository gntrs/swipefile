import React, { useState } from 'react';
import { aiStatus, analyzeAd } from '@/lib/ai';
import { angleLabel } from '@/lib/angles';
import { Panel, Button } from '@/components/ui';
import AiNotice, { useAiStatus, statusProblem } from './AiNotice';
import { shortDate } from './dates';

function Item({ label, children }) {
  return (
    <div>
      <p className="text-small font-medium text-ink-soft mb-1">{label}</p>
      <div className="text-body text-ink whitespace-pre-line max-w-[68ch]">{children}</div>
    </div>
  );
}

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
    <Panel title="Why it works" aria-label="Why it works">
      {ai ? (
        <div className="flex flex-col gap-5">
          {ai.hook && <Item label="Hook">{ai.hook}</Item>}
          {ai.angle && <Item label="Angle">{angleLabel(ai.angle) || ai.angle}</Item>}
          {ai.format && <Item label="Format">{ai.format}</Item>}
          {ai.audience && <Item label="Audience">{ai.audience}</Item>}
          {ai.why_it_works && <Item label="Why it works">{ai.why_it_works}</Item>}
          {ai.weaknesses && <Item label="Weak spots">{ai.weaknesses}</Item>}
          {ideas.length > 0 && (
            <Item label="Remix ideas">
              <ol className="flex flex-col gap-1.5">
                {ideas.map((idea, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ink-soft flex-shrink-0">{i + 1}.</span>
                    <span className="min-w-0">{idea}</span>
                  </li>
                ))}
              </ol>
            </Item>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button onClick={run} disabled={running}>
              {running ? 'Analyzing...' : 'Analyze again'}
            </Button>
            {byLine && <p className="text-small text-ink-soft">{byLine}</p>}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-body text-ink-soft max-w-[60ch] mb-4">
            Get a plain read of this ad: its hook, angle, audience, why it could work, where it is weak, and ideas to remix it.
          </p>
          <Button onClick={run} disabled={running}>
            {running ? 'Analyzing...' : 'Analyze'}
          </Button>
        </div>
      )}

      <AiNotice
        problem={problem}
        checking={checking}
        onRecheck={problem?.fromStatus && problem.code !== 'demo' ? onRecheck : undefined}
        onRetry={problem && !problem.fromStatus ? run : undefined}
        onDismiss={() => setProblem(null)}
      />
    </Panel>
  );
}
