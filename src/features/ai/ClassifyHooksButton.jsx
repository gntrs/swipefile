import React, { useEffect, useState } from 'react';
import { aiStatus, classifyAds, countUnclassified } from '@/lib/ai';
import { Button } from '@/components/ui';
import AiNotice, { useAiStatus, statusProblem } from './AiNotice';

// The label and the line under it, from what is known. Pure, for the tests.
export function classifyLabels({ ready, count, batchLimit, last }) {
  const size = last?.limit || batchLimit || null;
  let label = 'Tag angles';
  if (last && last.remaining > 0) label = `Tag next ${Math.min(size || last.remaining, last.remaining)}`;
  else if (ready && typeof count === 'number') label = `Tag angles (${count})`;
  let note = null;
  if (last) {
    note = last.remaining > 0
      ? `Tagged ${last.classified}. ${last.remaining} left.`
      : `Tagged ${last.classified}. Every hook has an angle.`;
  } else if (ready && count === 0) {
    note = 'Every hook has an angle.';
  } else if (ready && size) {
    note = `Tags up to ${size} hooks per press, one AI call each time.`;
  }
  return { label, note };
}

// Tags hooks with their persuasion angle, one batch per press, so the cost of
// each press is visible (E12).
export default function ClassifyHooksButton({ onDone }) {
  const { status, ready, checking, recheck } = useAiStatus();
  const [count, setCount] = useState(null);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState(null);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    if (!ready) return undefined;
    let alive = true;
    countUnclassified().then((r) => {
      if (alive && r.ok) setCount(r.count);
    });
    return () => {
      alive = false;
    };
  }, [ready]);

  const run = async () => {
    setProblem(null);
    const s = status || (await aiStatus());
    if (s.state !== 'ready') {
      setProblem({ ...statusProblem(s), fromStatus: true });
      return;
    }
    setRunning(true);
    const r = await classifyAds({});
    setRunning(false);
    if (!r.ok) {
      setProblem(r);
      return;
    }
    setLast(r);
    setCount(r.remaining);
    onDone?.(r);
  };

  const onRecheck = async () => {
    const s = await recheck();
    setProblem(s.state === 'ready' ? null : { ...statusProblem(s), fromStatus: true });
  };

  const { label, note } = classifyLabels({ ready, count, batchLimit: status?.batchLimit, last });
  const nothingLeft = ready && count === 0;

  return (
    <div className="inline-flex flex-col min-w-0 max-w-full">
      <Button onClick={run} disabled={running || nothingLeft} className="self-start">
        {running ? 'Tagging...' : label}
      </Button>
      {note && <p className="mt-1 text-small text-ink-soft">{note}</p>}
      <AiNotice
        problem={problem}
        checking={checking}
        onRecheck={problem?.fromStatus && problem.code !== 'demo' ? onRecheck : undefined}
        onRetry={problem && !problem.fromStatus ? run : undefined}
        onDismiss={() => setProblem(null)}
      />
    </div>
  );
}
