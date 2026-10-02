import React from 'react';
import { Delta, StatusDot } from '@/components/ui';

const DAY = 86400000;

export const PERIOD = 'vs 30 days ago';

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "today", "yesterday", "5d ago", "3mo ago". ms or an ISO string. '' when unknown.
export function ago(when, now = Date.now()) {
  const t = typeof when === 'number' ? when : Date.parse(when || '');
  if (!Number.isFinite(t)) return '';
  const days = Math.floor((now - t) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

// The live dot or the stopped ring, always with its word.
export function LiveMark({ live, className = '' }) {
  return (
    <StatusDot tone={live ? 'live' : 'stopped'} className={className}>
      {live ? 'Live' : 'Stopped'}
    </StatusDot>
  );
}

// The key numbers for a set of rival ads, from rivalKpis(). `winners` adds the
// fourth cell of the rival page in place of Stopped.
export function kpiCells(k, { winners, total } = {}) {
  const foot = (delta) => (delta ? <Delta delta={delta} period={PERIOD} /> : null);
  const running = k.running;
  const runningFoot = running.delta
    ? foot(running.delta)
    : running.dated === 0
      ? 'No start dates yet'
      : `${plural(running.undatedRunning, 'live ad has', 'live ads have')} no start date`;
  const cells = [
    { id: 'running', label: 'Running now', value: running.value, foot: runningFoot },
    { id: 'new', label: 'New, 30d', value: k.launched.value, foot: foot(k.launched.delta) },
    { id: 'proven', label: 'Live 60d+', value: k.provenLive.value, foot: foot(k.provenLive.delta) },
  ];
  if (winners !== undefined) {
    cells.push({ id: 'winners', label: 'Winners', value: winners, foot: total ? `of ${plural(total, 'ad', 'ads')}` : null });
  } else {
    cells.push({ id: 'stopped', label: 'Stopped, 30d', value: k.stopped.value, foot: foot(k.stopped.delta) });
  }
  return cells;
}

// The scale line under a set of heat strips.
export function heatScale(max) {
  if (!(max > 0)) return '';
  return max <= 1
    ? "12 weeks, ads running at each week's end. A lit cell is 1 ad running."
    : `12 weeks, ads running at each week's end. Darkest is 1, brightest is ${max}.`;
}
