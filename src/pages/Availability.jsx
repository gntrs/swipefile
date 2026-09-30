import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft, CaretRight, Plus } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { isMissingTable } from '@/lib/db';
import MigrationCard from '@/components/MigrationCard';
import AvailabilityEditor from '@/components/AvailabilityEditor';
import { Page, PageHeader, Button, IconButton, Chip } from '@/components/ui';

// The three things a teammate can say about a slot. Always shown WITH a label,
// never colour alone. `solid` = filled (selected button), `block` = soft fill
// for the block on the grid, `dot` = legend dot.
const STATUSES = [
  { key: 'in_office', label: 'In office', solid: 'bg-mint text-black', block: 'bg-mint/50 border-mint text-ink', dot: 'bg-mint' },
  { key: 'wfh', label: 'Home', full: 'Work from home', solid: 'bg-accent text-black', block: 'bg-accent-wash border-accent text-accent-dim', dot: 'bg-accent' },
  { key: 'out', label: 'Out', solid: 'bg-ink text-black', block: 'bg-canvas border-line text-ink-soft', dot: 'bg-ink-soft/60' },
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
    const { data, error } = await db
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
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX - 12;
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
      const { error } = await db.from('availability').update(values).eq('id', editor.block.id);
      if (error) throw error;
    } else {
      const { error } = await db
        .from('availability')
        .insert({ ...values, user_id: user.id, email: user.email });
      if (error) throw error;
    }
    setEditor(null);
    load();
  };

  const del = async (block) => {
    await db.from('availability').delete().eq('id', block.id);
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

  const header = (
    <PageHeader
      title="Availability"
      context="When the team is in office, working from home, or out."
      actions={
        !missing && (
          <Button variant="primary" icon={Plus} onClick={() => setEditor({ day: ymd(days[selDay]), start: 540 })}>
            Add
          </Button>
        )
      }
    />
  );

  if (missing) {
    return (
      <Page id="availability">
        {header}
        <MigrationCard title="Team availability" migration="db-setup.sql" />
      </Page>
    );
  }

  const shortDay = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const weekLabel = `${shortDay(days[0])} to ${shortDay(days[6])}`;

  // One day column (used both for the phone single-day view and each desktop column).
  const DayColumn = ({ d, i }) => {
    const dayStr = ymd(d);
    const isToday = dayStr === todayStr;
    return (
      <div
        onClick={(e) => addAt(dayStr, e)}
        className={`${i === selDay ? 'block' : 'hidden'} md:block flex-1 min-w-0 md:min-w-[92px] border-l border-line relative cursor-copy ${
          isToday ? 'bg-white/[0.02]' : ''
        }`}
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
              title={`${displayName(b.email)} · ${meta.full || meta.label} · ${allDay ? 'All day' : `${fmt(b.start_min)} to ${fmt(b.end_min)}`}${b.note ? ` · ${b.note}` : ''}`}
              className={`absolute rounded-lg border px-1.5 py-0.5 text-left overflow-hidden text-meta ${meta.block} ${mine ? 'ring-2 ring-ink/30 cursor-pointer' : 'cursor-default'}`}
              style={{ top, height, left: `calc(${b._lane * w}% + 2px)`, width: `calc(${w}% - 4px)` }}
            >
              <span className="block font-semibold truncate">
                {displayName(b.email)}{mine ? ' (you)' : ''}
              </span>
              {!short && (
                <span className="block opacity-80 truncate">
                  {allDay ? 'All day' : `${fmt(b.start_min)} to ${fmt(b.end_min)}`}
                  {b.note ? ` · ${b.note}` : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Page id="availability">
      {header}

      {/* Week nav on the left, legend on the right */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 mb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <IconButton label="Previous week" variant="secondary" icon={CaretLeft} onClick={() => setWeekStart((w) => addDays(w, -7))} />
          <Button
            variant="secondary"
            onClick={() => { setWeekStart(mondayOf(new Date())); setSelDay(weekdayIdx(new Date())); }}
          >
            Today
          </Button>
          <IconButton label="Next week" variant="secondary" icon={CaretRight} onClick={() => setWeekStart((w) => addDays(w, 7))} />
          <span className="sm:ml-2 text-ui font-semibold text-ink whitespace-nowrap">{weekLabel}</span>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {STATUSES.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-small text-ink-soft">
              <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${s.dot}`} /> {s.full || s.label}
            </li>
          ))}
        </ul>
      </div>

      {/* Phone: a day picker. One day at a time, full width, vertical scroll only. */}
      <div role="group" aria-label="Day" className="md:hidden scroll-x flex gap-2 mb-4 -mx-[var(--gutter)] px-[var(--gutter)]">
        {days.map((d, i) => {
          const isToday = ymd(d) === todayStr;
          return (
            <Chip key={ymd(d)} pressed={i === selDay} onClick={() => setSelDay(i)} aria-current={isToday ? 'date' : undefined}>
              {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
              {isToday && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-ink" />}
            </Chip>
          );
        })}
      </div>

      {/* The grid. Phone = 1 day full width; from md the whole week. Vertical scroll through the day. */}
      <div ref={scrollRef} className="overflow-auto overscroll-contain max-h-[64vh] rounded-xl3 bg-card">
        <div className="min-w-0 md:min-w-[680px]">
          {/* Day headers (from md; the phone uses the picker above) */}
          <div className="hidden md:flex sticky top-0 z-20 bg-card border-b border-line">
            <div className="w-14 flex-shrink-0 sticky left-0 z-10 bg-card" />
            {days.map((d) => {
              const isToday = ymd(d) === todayStr;
              return (
                <div
                  key={ymd(d)}
                  aria-current={isToday ? 'date' : undefined}
                  className={`flex-1 min-w-[92px] text-center py-2.5 border-l border-line ${isToday ? 'bg-white/[0.06]' : ''}`}
                >
                  <div className={`text-meta font-medium ${isToday ? 'text-ink' : 'text-ink-soft'}`}>
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </div>
                  <div className={`num text-ui ${isToday ? 'text-ink' : 'text-ink-soft'}`}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Body: hour gutter + day column(s) */}
          <div className="flex">
            <div className="w-14 flex-shrink-0 sticky left-0 z-10 bg-card relative" style={{ height: GRID_H }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute right-2 -translate-y-1/2 num text-meta text-ink-soft" style={{ top: h * HOUR_PX }}>
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

      <p className="text-small text-ink-soft mt-3">
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
    </Page>
  );
}
