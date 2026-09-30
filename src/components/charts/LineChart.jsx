import React, { useRef, useState } from 'react';
import { enoughForLine, knownPoints, linePath, nearestIndex, niceMax } from '@/lib/charts';

// One series over days, on a zero based axis with its scale printed: 0 at the
// bottom, a round maximum at the top, the first and last day under it. A day
// with no data is a gap, never a zero. Under three real points there is no
// direction to show, so it prints the numbers instead of drawing a line.
// A crosshair follows the pointer (or the arrow keys) and reads out the day.
//
// series: [{ day: 'YYYY-MM-DD', value: number | null }]
const W = 600;
const H = 120;

const fmtDay = (d) => {
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

export default function LineChart({ series, unit, format = (v) => v.toLocaleString(), label }) {
  const [at, setAt] = useState(null);
  const box = useRef(null);
  const known = series.filter((p) => p.value != null);

  if (!enoughForLine(series)) {
    return (
      <p className="text-small text-ink-soft">
        {knownPoints(series) === 0
          ? `No ${unit} recorded in this period.`
          : `Only ${knownPoints(series)} ${knownPoints(series) === 1 ? 'day' : 'days'} recorded, too few for a trend: ${known
              .map((p) => `${format(p.value)} on ${fmtDay(p.day)}`)
              .join(', ')}.`}
      </p>
    );
  }

  const peak = Math.max(...known.map((p) => p.value));
  const max = niceMax(peak);
  const d = linePath(series, { width: W, height: H, max });
  const step = series.length > 1 ? W / (series.length - 1) : 0;
  const last = [...series].reverse().find((p) => p.value != null);
  const lastIndex = series.lastIndexOf(last);
  const cur = at != null ? series[at] : null;

  const move = (clientX) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setAt(nearestIndex(series, (clientX - r.left) / r.width));
  };
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = at ?? lastIndex;
    setAt(Math.min(series.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1))));
  };

  return (
    <figure className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 mb-2 min-h-[1.35rem]">
        <span className="text-small text-ink-soft">{label}</span>
        <span className="text-small text-ink-soft text-right" aria-live="polite">
          {cur ? (
            <>
              {fmtDay(cur.day)}{' '}
              <span className="num text-ink">{cur.value == null ? 'no data' : format(cur.value)}</span>
            </>
          ) : (
            <>
              Latest {fmtDay(last.day)} <span className="num text-ink">{format(last.value)}</span>
            </>
          )}
        </span>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* Tick labels centred on the gridline they name: the top line and the zero baseline. */}
        <div className="relative text-meta text-ink-soft num text-right h-[120px]" aria-hidden="true">
          <span className="block invisible">{format(max)}</span>
          <span className="absolute right-0 top-0 -translate-y-1/2">{format(max)}</span>
          <span className="absolute right-0 bottom-0 translate-y-1/2">0</span>
        </div>
        <div
          ref={box}
          className="relative h-[120px] touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-sm"
          tabIndex={0}
          role="img"
          aria-label={`${label}. Scale 0 to ${format(max)}. Use the arrow keys to read each day.`}
          onPointerMove={(e) => move(e.clientX)}
          onPointerDown={(e) => move(e.clientX)}
          onPointerLeave={() => setAt(null)}
          onKeyDown={onKey}
          onBlur={() => setAt(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
            <line x1="0" x2={W} y1="0" y2="0" stroke="var(--viz-grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2={W} y1={H} y2={H} stroke="var(--viz-axis)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <path d={d} fill="none" stroke="var(--viz-bar)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {cur && (
              <line x1={at * step} x2={at * step} y1="0" y2={H} stroke="var(--viz-axis)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {/* Dots are HTML so they stay round when the plot stretches. */}
          {[cur ? at : lastIndex].map((i) =>
            series[i]?.value == null ? null : (
              <span
                key={i}
                aria-hidden="true"
                className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-viz-bar-hi ring-2 ring-[var(--viz-surface)]"
                style={{ left: `${(i * step * 100) / W}%`, top: `${100 - (series[i].value / max) * 100}%` }}
              />
            ),
          )}
        </div>
        <span />
        <div className="flex justify-between text-meta text-ink-soft mt-1.5" aria-hidden="true">
          <span>{fmtDay(series[0].day)}</span>
          <span>{fmtDay(series[series.length - 1].day)}</span>
        </div>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {series.map((p) => (
            <tr key={p.day}>
              <th scope="row">{p.day}</th>
              <td>{p.value == null ? 'no data' : format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
