import React from 'react';
import { Link } from 'react-router-dom';
import Pill from '@/components/Pill';
import Sparkline from '@/components/Sparkline';

// Accent system: a tinted icon chip carries the colour, the big number stays
// light. On the dark canvas only the meaningful accents pop; decorative ones
// (blue/violet) read as neutral grayscale.
const CHIP = {
  base: 'bg-white/[0.08] text-ink',
  emerald: 'bg-emerald-500/15 text-emerald-300',
  blue: 'bg-white/[0.06] text-ink-soft',
  violet: 'bg-white/[0.06] text-ink-soft',
  amber: 'bg-amber-500/15 text-amber-300',
  rose: 'bg-red-500/15 text-red-300',
  mint: 'bg-emerald-500/15 text-emerald-300',
};

// Sparkline stroke follows the accent so the trend reads as part of the tile.
const STROKE = {
  base: 'text-ink',
  emerald: 'text-emerald-400',
  blue: 'text-ink-soft',
  violet: 'text-ink-soft',
  amber: 'text-amber-400',
  rose: 'text-red-400',
  mint: 'text-emerald-400',
};

// Hero-number stat tile. Pass `to` to make the whole tile a shortcut, `trend`
// (array of numbers) for a sparkline, and `delta`/`deltaTone` for a status pill.
export default function StatCard({ icon: Icon, label, value, sub, accent = 'base', to, trend, delta, deltaTone = 'good' }) {
  const chip = CHIP[accent] || CHIP.base;
  const stroke = STROKE[accent] || STROKE.base;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${chip}`}>
          <Icon size={20} weight="bold" />
        </span>
        {delta != null && <Pill tone={deltaTone}>{delta}</Pill>}
      </div>
      <div className="min-w-0 mt-3">
        <p className="font-mono text-[30px] font-medium leading-none tabular-nums">{value}</p>
        <p className="kicker mt-2.5 truncate">{label}</p>
        {sub && <p className="text-[13px] text-ink-soft mt-1 truncate">{sub}</p>}
      </div>
      {trend && trend.length > 1 && (
        <span className={`block mt-3 -mb-1 ${stroke}`}>
          <Sparkline data={trend} className="w-full h-7" />
        </span>
      )}
    </>
  );
  const cls =
    'bg-card rounded-xl3 shadow-card p-5 flex flex-col transition-all duration-300 ease-swift';
  if (to) {
    return (
      <Link to={to} className={`${cls} press hover:bg-card-hi`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
