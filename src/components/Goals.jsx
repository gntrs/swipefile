import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, PencilSimple, Plus, Trash, Warning } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { isMissingTable } from '@/lib/db';
import MigrationCard from '@/components/MigrationCard';
import { RowsSkeleton } from '@/components/Skeleton';
import { Panel, Badge, Button, IconButton, inputCls, selectCls } from '@/components/ui';

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
  let tone = 'neutral';
  let text = `Due ${label}`;
  if (!goal.done) {
    if (left < 0) {
      tone = 'bad';
      text = `Was due ${label}`;
    } else if (left === 0) {
      tone = 'warn';
      text = 'Due today';
    } else if (left <= 3) {
      tone = 'warn';
    }
  }
  return <Badge tone={tone}>{text}</Badge>;
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
    const { data, error } = await db
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
    const channel = db
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
      db.removeChannel(channel);
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
    const { data, error } = await db.from('goals').insert(row).select().single();
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
    const { error } = await db.from('goals').delete().eq('id', goal.id);
    if (error) setGoals((cur) => [goal, ...cur]); // put it back
  };

  const toggle = async (goal) => {
    const next = !goal.done;
    setGoals((cur) => cur.map((g) => (g.id === goal.id ? { ...g, done: next } : g)));
    const { error } = await db.from('goals').update({ done: next }).eq('id', goal.id);
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
    const { error } = await db.from('goals').update(fields).eq('id', goal.id);
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

  const smallSelect = `${selectCls} !w-auto flex-shrink-0`;

  return (
    <Panel
      title="Goals"
      className="flex flex-col"
      action={
        isAdmin && (
          <IconButton
            label="Toggle goal editing"
            icon={PencilSimple}
            variant={editing ? 'secondary' : 'ghost'}
            pressed={editing}
            onClick={() => {
              setEditing((e) => !e);
              setEditId(null);
            }}
            className="-my-2 -mr-2"
          />
        )
      }
    >
      <div className="max-h-[28rem] overflow-y-auto overscroll-contain -mx-2 px-2">
        {loading ? (
          <RowsSkeleton rows={3} className="!bg-transparent" />
        ) : groups.length === 0 ? (
          <p className="text-body text-ink-soft py-1">No goals yet. Add the first one for this week.</p>
        ) : (
          groups.map((h) => (
            <div key={h.key} className="mb-4 last:mb-0">
              <p className="text-small font-semibold text-ink-soft mb-1">{h.label}</p>
              {h.items.map((g) =>
                editId === g.id ? (
                  <div key={g.id} className="py-2 flex flex-col gap-2">
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      maxLength={140}
                      autoFocus
                      aria-label="Goal"
                      className={inputCls}
                    />
                    <div className="flex items-center gap-1.5">
                      <select
                        value={draft.horizon}
                        onChange={(e) => setDraft((d) => ({ ...d, horizon: e.target.value }))}
                        aria-label="Horizon"
                        className={smallSelect}
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
                        className={`${inputCls} flex-1 min-w-0 !px-2.5`}
                      />
                      <IconButton
                        label="Toggle urgent"
                        icon={Warning}
                        pressed={draft.urgent}
                        variant={draft.urgent ? 'danger' : 'ghost'}
                        onClick={() => setDraft((d) => ({ ...d, urgent: !d.urgent }))}
                        className={draft.urgent ? '!bg-red-500/15' : ''}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" icon={Check} onClick={() => saveEdit(g)} disabled={!draft.title.trim()} aria-label="Save goal">
                        Save
                      </Button>
                      <Button variant="ghost" onClick={() => setEditId(null)} aria-label="Cancel edit">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label key={g.id} className="flex items-start gap-3 min-h-[44px] py-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!g.done}
                      onChange={() => toggle(g)}
                      className="sr-only peer"
                      data-probe-skip
                    />
                    <span
                      aria-hidden="true"
                      className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink ${
                        g.done ? 'bg-mint border-mint' : 'border-white/25 group-hover:border-ink'
                      }`}
                    >
                      {g.done && <Check size={13} weight="bold" className="text-black" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      {g.brief_id ? (
                        <Link
                          to={`/briefs?open=${g.brief_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`block min-h-[44px] py-2 -my-2 text-body break-words underline decoration-line underline-offset-2 hover:decoration-ink ${
                            g.done ? 'line-through text-ink-soft/60' : 'text-ink'
                          }`}
                        >
                          {g.title}
                        </Link>
                      ) : (
                        <span className={`block text-body break-words ${g.done ? 'line-through text-ink-soft/60' : 'text-ink'}`}>
                          {g.title}
                        </span>
                      )}
                      {(g.urgent || g.deadline || g.created_by_email) && (
                        <span className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                          {g.urgent && !g.done && (
                            <Badge tone="bad">
                              <Warning size={12} weight="bold" aria-hidden="true" /> Urgent
                            </Badge>
                          )}
                          <DeadlineChip goal={g} />
                          {g.created_by_email && (
                            <span className="text-small text-ink-soft">by {displayName(g.created_by_email)}</span>
                          )}
                        </span>
                      )}
                    </span>
                    {isAdmin && editing && (
                      <span className="flex flex-shrink-0 -my-1.5">
                        <IconButton
                          label={`Edit goal: ${g.title}`}
                          icon={PencilSimple}
                          onClick={(e) => {
                            e.preventDefault();
                            startEdit(g);
                          }}
                        />
                        <IconButton
                          label={`Delete goal: ${g.title}`}
                          icon={Trash}
                          variant="danger"
                          onClick={(e) => {
                            e.preventDefault();
                            remove(g);
                          }}
                        />
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
        <form onSubmit={add} className="flex flex-col gap-2 mt-4 pt-4 border-t border-line">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a goal"
            aria-label="Add a goal"
            maxLength={140}
            className={inputCls}
          />
          <div className="flex items-center gap-1.5">
            <select value={horizon} onChange={(e) => setHorizon(e.target.value)} aria-label="Horizon" className={smallSelect}>
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
              className={`${inputCls} flex-1 min-w-0 !px-2.5`}
            />
            <IconButton
              label="Mark as urgent"
              icon={Warning}
              pressed={urgent}
              variant={urgent ? 'danger' : 'ghost'}
              onClick={() => setUrgent((u) => !u)}
              className={urgent ? '!bg-red-500/15' : ''}
            />
            <IconButton type="submit" label="Add goal" icon={Plus} variant="secondary" disabled={!title.trim()} />
          </div>
        </form>
      )}
    </Panel>
  );
}
