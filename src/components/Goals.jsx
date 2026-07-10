import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, PencilSimple, Plus, Trash, Warning, X } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { isMissingTable } from '@/lib/db';
import MigrationCard from '@/components/MigrationCard';

const POLL_MS = 15000; // fallback when realtime is off

const HORIZONS = [
  { key: '1w', label: '1 week' },
  { key: '2w', label: '2 weeks' },
  { key: '1m', label: '1 month' },
];

// How many full days until a YYYY-MM-DD deadline (negative = overdue).
function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

function DeadlineChip({ goal }) {
  if (!goal.deadline) return null;
  const [y, m, d] = goal.deadline.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const left = daysUntil(goal.deadline);
  let cls = 'bg-cream text-ink-soft';
  let text = `due ${label}`;
  if (!goal.done) {
    if (left < 0) {
      cls = 'bg-red-100 text-red-600';
      text = `was due ${label}`;
    } else if (left === 0) {
      cls = 'bg-amber-100 text-amber-700';
      text = 'due today';
    } else if (left <= 3) {
      cls = 'bg-amber-100 text-amber-700';
    }
  }
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {text}
    </span>
  );
}

// Team goals grouped by horizon. Everyone sees the same card and ticks goals
// off; adding, editing and deleting goals is the admin's job, behind the pen
// toggle, and migration 8 enforces that in the database too.
export default function Goals() {
  const { user } = useAuth();
  const { displayName, isAdmin } = useTeam();
  const [goals, setGoals] = useState([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [title, setTitle] = useState('');
  const [horizon, setHorizon] = useState('1w');
  const [deadline, setDeadline] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({ title: '', horizon: '1w', deadline: '', urgent: false });

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingTable(error)) setMissing(true);
      setLoading(false);
      return;
    }
    setGoals(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates so new goals (added by the team or by Claude's chat watcher)
  // just appear, no full-page or full-list refresh needed. Falls back to a
  // slow poll only when the realtime channel is not connected.
  useEffect(() => {
    if (missing) return undefined;
    const channel = supabase
      .channel('goals-board')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'goals' }, (payload) => {
        if (!payload.new) return;
        setGoals((cur) => (cur.some((g) => g.id === payload.new.id) ? cur : [payload.new, ...cur]));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'goals' }, (payload) => {
        if (!payload.new) return;
        setGoals((cur) => cur.map((g) => (g.id === payload.new.id ? payload.new : g)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'goals' }, (payload) => {
        if (!payload.old?.id) return;
        setGoals((cur) => cur.filter((g) => g.id !== payload.old.id));
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [missing]);

  useEffect(() => {
    if (missing || live) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [missing, live, load]);

  const add = async (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || !user) return;
    setTitle('');
    // Optional fields only when set, so the insert works before migration 8/9.
    const row = { title: t, horizon, created_by_email: user.email };
    if (deadline) row.deadline = deadline;
    if (urgent) row.urgent = true;
    const { data, error } = await supabase.from('goals').insert(row).select().single();
    if (error) {
      if (isMissingTable(error)) setMissing(true);
      else setTitle(t); // give the text back instead of losing it
      return;
    }
    setDeadline('');
    setUrgent(false);
    if (data) setGoals((cur) => [data, ...cur]);
  };

  const remove = async (goal) => {
    setGoals((cur) => cur.filter((g) => g.id !== goal.id));
    const { error } = await supabase.from('goals').delete().eq('id', goal.id);
    if (error) setGoals((cur) => [goal, ...cur]); // put it back
  };

  const toggle = async (goal) => {
    const next = !goal.done;
    setGoals((cur) => cur.map((g) => (g.id === goal.id ? { ...g, done: next } : g)));
    const { error } = await supabase.from('goals').update({ done: next }).eq('id', goal.id);
    if (error) {
      // Put it back the way it was.
      setGoals((cur) => cur.map((g) => (g.id === goal.id ? { ...g, done: goal.done } : g)));
    }
  };

  const startEdit = (goal) => {
    setEditId(goal.id);
    setDraft({
      title: goal.title,
      horizon: goal.horizon,
      deadline: goal.deadline || '',
      urgent: !!goal.urgent,
    });
  };

  const saveEdit = async (goal) => {
    const t = draft.title.trim();
    if (!t) return;
    const fields = {
      title: t,
      horizon: draft.horizon,
      deadline: draft.deadline || null,
      urgent: draft.urgent,
    };
    setEditId(null);
    setGoals((cur) => cur.map((g) => (g.id === goal.id ? { ...g, ...fields } : g)));
    const { error } = await supabase.from('goals').update(fields).eq('id', goal.id);
    if (error) {
      // Put the original row back.
      setGoals((cur) => cur.map((g) => (g.id === goal.id ? goal : g)));
    }
  };

  // Group by horizon; open first, urgent next, nearest deadline inside each.
  const groups = useMemo(
    () =>
      HORIZONS.map((h) => ({
        ...h,
        items: goals
          .filter((g) => g.horizon === h.key)
          .sort(
            (a, b) =>
              Number(a.done) - Number(b.done) ||
              Number(!!b.urgent) - Number(!!a.urgent) ||
              (a.deadline || '9999').localeCompare(b.deadline || '9999')
          ),
      })).filter((h) => h.items.length > 0),
    [goals]
  );

  if (missing) return <MigrationCard title="Goals" />;

  return (
    <div className="bg-card rounded-xl3 border border-line shadow-card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-[15px]">Goals</h2>
        {isAdmin && (
          <button
            onClick={() => {
              setEditing((e) => !e);
              setEditId(null);
            }}
            aria-label="Toggle goal editing"
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              editing ? 'bg-coral text-black shadow-cta' : 'text-ink-soft hover:bg-cream'
            }`}
          >
            <PencilSimple size={15} weight="bold" />
          </button>
        )}
      </div>

      {/* Fixed height like the chat list next door: flex-1 let the content
          stretch the card to the full goal list (min-height:auto), so the
          overflow scroll never engaged and the card ate the whole page. */}
      <div className="h-[380px] overflow-y-auto -mx-1 px-1">
        {loading ? (
          <p className="text-ink-soft text-[13px] py-2">Loading...</p>
        ) : groups.length === 0 ? (
          <p className="text-ink-soft text-[13px] py-2">
            No goals yet. Add the first one for this week.
          </p>
        ) : (
          groups.map((h) => (
            <div key={h.key} className="mb-3 last:mb-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/80 mb-1">
                {h.label}
              </p>
              {h.items.map((g) =>
                editId === g.id ? (
                  <div key={g.id} className="py-1.5 flex flex-col gap-1.5">
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      maxLength={140}
                      autoFocus
                      className="w-full py-2 px-3 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[16px] sm:text-[14px]"
                    />
                    <div className="flex items-center gap-1.5">
                      <select
                        value={draft.horizon}
                        onChange={(e) => setDraft((d) => ({ ...d, horizon: e.target.value }))}
                        aria-label="Horizon"
                        className="py-2 px-2.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[13px] text-ink-soft"
                      >
                        {HORIZONS.map((hh) => (
                          <option key={hh.key} value={hh.key}>
                            {hh.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={draft.deadline}
                        onChange={(e) => setDraft((d) => ({ ...d, deadline: e.target.value }))}
                        aria-label="Deadline"
                        className="flex-1 min-w-0 py-2 px-2.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[13px] text-ink-soft"
                      />
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, urgent: !d.urgent }))}
                        aria-label="Toggle urgent"
                        aria-pressed={draft.urgent}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                          draft.urgent ? 'bg-red-100 text-red-600' : 'text-ink-soft hover:bg-cream'
                        }`}
                      >
                        <Warning size={14} weight="bold" />
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(g)}
                        disabled={!draft.title.trim()}
                        aria-label="Save goal"
                        className="w-8 h-8 rounded-xl bg-coral text-black flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                      >
                        <Check size={14} weight="bold" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId(null)}
                        aria-label="Cancel edit"
                        className="w-8 h-8 rounded-xl text-ink-soft hover:bg-cream flex items-center justify-center flex-shrink-0"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    key={g.id}
                    className="flex items-start gap-2.5 py-1.5 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={!!g.done}
                      onChange={() => toggle(g)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                        g.done ? 'bg-mint border-mint' : 'border-line bg-cream group-hover:border-coral'
                      }`}
                    >
                      {g.done && <Check size={12} weight="bold" className="text-ink" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      {g.brief_id ? (
                        <Link
                          to={`/briefs?open=${g.brief_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`block text-[14px] leading-snug break-words underline decoration-line underline-offset-2 hover:decoration-coral ${
                            g.done ? 'line-through text-ink-soft/60' : ''
                          }`}
                        >
                          {g.title}
                        </Link>
                      ) : (
                        <span
                          className={`block text-[14px] leading-snug break-words ${
                            g.done ? 'line-through text-ink-soft/60' : ''
                          }`}
                        >
                          {g.title}
                        </span>
                      )}
                      <span className="flex items-center flex-wrap gap-1.5 mt-0.5">
                        {g.urgent && !g.done && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                            <Warning size={11} weight="bold" /> urgent
                          </span>
                        )}
                        <DeadlineChip goal={g} />
                        {g.created_by_email && (
                          <span className="text-[11px] text-ink-soft/70">
                            by {displayName(g.created_by_email)}
                          </span>
                        )}
                      </span>
                    </span>
                    {isAdmin && editing && (
                      <span className="flex flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            startEdit(g);
                          }}
                          aria-label={`Edit goal: ${g.title}`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-cream"
                        >
                          <PencilSimple size={14} weight="bold" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            remove(g);
                          }}
                          aria-label={`Delete goal: ${g.title}`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"
                        >
                          <Trash size={14} weight="bold" />
                        </button>
                      </span>
                    )}
                  </label>
                )
              )}
            </div>
          ))
        )}
      </div>

      {isAdmin && editing && (
        <form onSubmit={add} className="flex flex-col gap-2 mt-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a goal"
            maxLength={140}
            className="w-full py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[16px] sm:text-[14px]"
          />
          <div className="flex items-center gap-2">
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              aria-label="Horizon"
              className="py-2.5 px-3 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[16px] sm:text-[13px] text-ink-soft flex-shrink-0"
            >
              {HORIZONS.map((h) => (
                <option key={h.key} value={h.key}>
                  {h.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              aria-label="Deadline (optional)"
              className="flex-1 min-w-0 py-2.5 px-3 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[16px] sm:text-[13px] text-ink-soft"
            />
            <button
              type="button"
              onClick={() => setUrgent((u) => !u)}
              aria-label="Mark as urgent"
              aria-pressed={urgent}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
                urgent ? 'bg-red-100 text-red-600' : 'text-ink-soft border border-line bg-card'
              }`}
            >
              <Warning size={16} weight="bold" />
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              aria-label="Add goal"
              className="w-10 h-10 rounded-2xl bg-coral text-black flex items-center justify-center flex-shrink-0 shadow-cta active:scale-[0.96] transition-transform disabled:opacity-40 disabled:shadow-none"
            >
              <Plus size={17} weight="bold" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
