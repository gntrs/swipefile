import React from 'react';
import { heatStep } from '@/lib/charts';

// A row of cells, one per period (ads running at each week's end), shaded on
// one grey ramp. Every strip in a view shares one `max`, named in a caption
// beside it, so the same shade means the same count. A zero is the bare
// track. Not interactive and no hover: the row it sits in is the link, the
// count beside it carries the number, and screen readers get every value.
const STEP = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4', 'bg-heat-5'];

const said = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? 'unknown' : String(Number(v)));

export default function HeatStrip({ values = [], max, label = '', className = '' }) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return null;
  const top = max ?? Math.max(0, ...list.map((v) => Number(v) || 0));
  return (
    <div role="img" aria-label={`${label}${label ? ': ' : ''}${list.map(said).join(', ')}`} className={`flex gap-[2px] h-[14px] min-w-0 ${className}`}>
      {list.map((v, i) => (
        <span key={i} data-step={heatStep(v, top)} className={`flex-1 min-w-0 rounded-[2px] ${STEP[heatStep(v, top)]}`} />
      ))}
    </div>
  );
}
