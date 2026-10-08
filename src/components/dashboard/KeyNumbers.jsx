import React from 'react';
import { KpiGroup, Delta, StatusDot } from '@/components/ui';

// The key numbers row: "Your ads" (or "Your library") and "Rivals" side by
// side from md, stacked on a phone. The cells come from topMetrics(); this
// only turns each foot into its mark. The number itself is never coloured.
function footNode(foot) {
  if (!foot) return null;
  if (foot.kind === 'delta') return <Delta delta={foot.delta} period={foot.period} />;
  if (foot.kind === 'status') return <StatusDot tone={foot.tone}>{foot.word}</StatusDot>;
  if (foot.kind === 'text') return foot.text;
  return null;
}

const toCells = (cells) =>
  cells.map((c) => ({
    id: c.id,
    label: c.label,
    value: c.value == null ? null : c.display,
    to: c.to,
    foot: footNode(c.foot),
    srText: c.srText || undefined,
  }));

const colsFor = (n) => Math.max(2, Math.min(3, n));

export default function KeyNumbers({ metrics, loading = false }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
        <KpiGroup loading cols={3} />
        <KpiGroup loading cols={3} />
      </div>
    );
  }
  if (!metrics) return null;
  const { you, rivals } = metrics;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6" data-block="key-numbers">
      <KpiGroup
        title={you.title}
        meta={you.meta}
        cols={colsFor(you.cells.length)}
        cells={toCells(you.cells)}
        className={rivals ? '' : 'md:col-span-2'}
        data-group={you.id}
      />
      {rivals && (
        <KpiGroup title={rivals.title} meta={rivals.meta} cols={3} cells={toCells(rivals.cells)} data-group="rivals" />
      )}
    </div>
  );
}
