import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft, CaretRight, Plus, CalendarBlank } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { isMissingTable } from '@/lib/db';
import MigrationCard from '@/components/MigrationCard';
import AvailabilityEditor from '@/components/AvailabilityEditor';

// The three things a teammate can say about a slot. Always shown WITH a label,
// never colour alone. `solid` = filled (selected button), `block` = soft fill
// for the block on the grid, `dot` = legend dot.
const STATUSES = [
  { key: 'in_office', label: 'In office', solid: 'bg-mint text-emerald-900', block: 'bg-mint/50 border-mint text-emerald-900', dot: 'bg-mint' },
  { key: 'wfh', label: 'Home', full: 'Work from home', solid: 'bg-coral text-black', block: 'bg-coral-soft border-coral text-coral-dark', dot: 'bg-coral' },
  { key: 'out', label: 'Out', solid: 'bg-ink text-black', block: 'bg-cream border-line text-ink-soft', dot: 'bg-line' },
];
const META = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

const HOUR_PX = 40;
const GRID_H = 24 * HOUR_PX;
// Hour lines drawn with a gradient (no per-line DOM nodes).
const GRID_BG = `repeating-linear-gradient(to bottom, transparent, transparent ${HOUR_PX - 1}px, #262626 ${HOUR_PX - 1}px, #262626 ${HOUR_PX}px)`;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekdayIdx = (d) => (d.getDay() + 6) % 7; // Mon = 0
const mondayOf = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - weekdayIdx(d));
  return d;
};
const fmt = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

// Lay overlapping blocks side by side: pack each day's blocks into lanes so two
// people at the same time sit in adjacent columns instead of on top of each other.
function layout(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds = [];
    cluster.forEach((b) => {
      let lane = laneEnds.findIndex((end) => end <= b.start_min);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = b.end_min;
      b._lane = lane;
    });
    cluster.forEach((b) => { b._lanes = laneEnds.length; out.push(b); });
    cluster = [];
  };
  sorted.forEach((b) => {
    if (cluster.length && b.start_min >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end_min);
  });
  flush();
  return out;
}

export default function Availability() {
  const { user } = useAuth();
  const { displayName } = useTeam();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [selDay, setSelDay] = useState(() => weekdayIdx(new Date())); // which day the phone shows
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [editor, setEditor] = useState(null); // { block } | { day, start }
  const scrollRef = useRef(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const todayStr = ymd(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .gte('day', ymd(days[0]))
      .lte('day', ymd(days[6]));
    if (error) {
      if (isMissingTable(error)) setMissing(true);
      setLoading(false);
      return;
    }
    setRows(data || []);
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Open scrolled to the working day, not to midnight.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX;
  }, [missing]);

  const byDay = useMemo(() => {
    const m = {};
    days.forEach((d) => (m[ymd(d)] = []));
    rows.forEach((r) => { if (m[r.day]) m[r.day].push(r); });
    Object.keys(m).forEach((k) => (m[k] = layout(m[k])));
    return m;
  }, [rows, days]);

  const save = async (values) => {
    if (editor?.block?.id) {
      const { error } = await supabase.from('availability').update(values).eq('id', editor.block.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('availability')
        .insert({ ...values, user_id: user.id, email: user.email });
      if (error) throw error;
    }
    setEditor(null);
    load();
  };

  const del = async (block) => {
    await supabase.from('availability').delete().eq('id', block.id);
    setEditor(null);
    load();
  };

  // Tap empty space in a day column -> add a block starting near that time.
  const addAt = (dayStr, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const snapped = Math.max(0, Math.min(1410, Math.round((y / HOUR_PX) * 60 / 30) * 30));
    setEditor({ day: dayStr, start: snapped });
  };

  if (missing) {
    return (
      <div className="px-5 sm:px-8 py-6 max-w-[1100px] mx-auto">
        <MigrationCard title="Team availability" migration="supabase-migration-7.sql" />
      </div>
    );
  }

  const weekLabel = `${days[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - ${days[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  // One day column (used both for the phone single-day view and each desktop column).
  const DayColumn = ({ d, i }) => {
    const dayStr = ymd(d);
    return (
      <div
        onClick={(e) => addAt(dayStr, e)}
        className={`${i === selDay ? 'block' : 'hidden'} sm:block flex-1 min-w-0 sm:min-w-[92px] border-l border-line relative cursor-copy`}
        style={{ height: GRID_H, backgroundImage: GRID_BG }}
      >
        {byDay[dayStr]?.map((b) => {
          const meta = META[b.status] || META.in_office;
          const mine = b.user_id === user?.id;
          const top = (b.start_min / 60) * HOUR_PX;
          const height = Math.max(20, ((b.end_min - b.start_min) / 60) * HOUR_PX);
          const w = 100 / b._lanes;
          const short = height < 36;
          const allDay = b.start_min === 0 && b.end_min === 1440;
          return (
            <button
              key={b.id}
              onClick={(e) => { e.stopPropagation(); if (mine) setEditor({ block: b }); }}
              title={`${displayName(b.email)} · ${meta.full || meta.label} · ${allDay ? 'All day' : `${fmt(b.start_min)}-${fmt(b.end_min)}`}${b.note ? ` · ${b.note}` : ''}`}
              className={`absolute rounded-lg border px-1.5 py-0.5 text-left overflow-hidden ${meta.block} ${mine ? 'ring-2 ring-offset-1 ring-ink/20 cursor-pointer' : 'cursor-default'}`}
              style={{ top, height, left: `calc(${b._lane * w}% + 2px)`, width: `calc(${w}% - 4px)` }}
            >
              <div className={`font-semibold truncate leading-tight ${short ? 'text-[10px]' : 'text-[11px]'}`}>
                {displayName(b.email)}{mine ? ' (you)' : ''}
              </div>
              {!short && (
                <div className="text-[10px] opacity-80 truncate leading-tight">
                  {allDay ? 'All day' : `${fmt(b.start_min)}-${fmt(b.end_min)}`}
                  {b.note ? ` · ${b.note}` : ''}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Availability</h1>
        <button
          onClick={() => setEditor({ day: ymd(days[selDay]), start: 540 })}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-coral text-black text-[14px] font-semibold shadow-cta active:scale-[0.97] transition-transform"
        >
          <Plus size={16} weight="bold" /> Add
        </button>
      </div>
      <p className="text-ink-soft text-[14px] mb-4">When the team is in office, working from home, or out.</p>

      {/* Week nav + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week" className="w-9 h-9 rounded-2xl bg-card border border-line flex items-center justify-center text-ink-soft hover:bg-cream">
            <CaretLeft size={16} weight="bold" />
          </button>
          <button onClick={() => { setWeekStart(mondayOf(new Date())); setSelDay(weekdayIdx(new Date())); }} className="px-3 h-9 rounded-2xl bg-card border border-line text-[13px] font-semibold text-ink-soft hover:bg-cream">
            Today
          </button>
          <button onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week" className="w-9 h-9 rounded-2xl bg-card border border-line flex items-center justify-center text-ink-soft hover:bg-cream">
            <CaretRight size={16} weight="bold" />
          </button>
          <span className="ml-2 text-[14px] font-semibold tabular-nums">{weekLabel}</span>
        </div>
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
          {STATUSES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[13px] text-ink-soft">
              <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} /> {s.full || s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Phone: a day picker. One day at a time, full width, vertical scroll only. */}
      <div className="sm:hidden flex gap-1.5 mb-3 overflow-x-auto -mx-5 px-5">
        {days.map((d, i) => {
          const isToday = ymd(d) === todayStr;
          return (
            <button
              key={ymd(d)}
              onClick={() => setSelDay(i)}
              className={`flex-shrink-0 px-3 py-2 rounded-2xl text-[13px] font-semibold tabular-nums transition-colors ${
                i === selDay ? 'bg-coral text-black shadow-cta' : isToday ? 'bg-coral-soft text-coral-dark' : 'bg-card border border-line text-ink-soft'
              }`}
            >
              {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
            </button>
          );
        })}
      </div>

      {/* The grid. Phone = 1 day full width; desktop = the whole week. Vertical scroll through the day. */}
      <div ref={scrollRef} className="overflow-auto overscroll-contain max-h-[64vh] border border-line rounded-xl3 bg-card shadow-card">
        <div className="min-w-0 sm:min-w-[680px]">
          {/* Day headers (desktop only - phone uses the picker above) */}
          <div className="hidden sm:flex sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-line">
            <div className="w-12 flex-shrink-0 sticky left-0 z-10 bg-card/95" />
            {days.map((d) => {
              const isToday = ymd(d) === todayStr;
              return (
                <div key={ymd(d)} className={`flex-1 min-w-[92px] text-center py-2 border-l border-line ${isToday ? 'bg-coral-soft' : ''}`}>
                  <div className="text-[11px] uppercase tracking-wide text-ink-soft">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                  <div className={`text-[15px] font-semibold tabular-nums ${isToday ? 'text-coral-dark' : ''}`}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Body: hour gutter + day column(s) */}
          <div className="flex">
            <div className="w-12 flex-shrink-0 sticky left-0 z-10 bg-card relative" style={{ height: GRID_H }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-ink-soft tabular-nums" style={{ top: h * HOUR_PX }}>
                  {h === 0 ? '' : `${h}:00`}
                </div>
              ))}
            </div>
            {days.map((d, i) => (
              <DayColumn key={ymd(d)} d={d} i={i} />
            ))}
          </div>
        </div>
      </div>

      <p className="text-[12px] text-ink-soft mt-2 flex items-center gap-1.5">
        <CalendarBlank size={13} weight="bold" />
        {loading ? 'Loading...' : 'Tap the grid to add. You can only edit your own blocks (they show a ring).'}
      </p>

      {editor && (
        <AvailabilityEditor
          block={editor.block}
          defaultDay={editor.day}
          defaultStart={editor.start}
          statuses={STATUSES}
          onSave={save}
          onDelete={del}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
