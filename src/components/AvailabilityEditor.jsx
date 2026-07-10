import React, { useEffect, useState } from 'react';
import { X, Trash } from '@phosphor-icons/react';

// Convert between minutes-from-midnight and the "HH:MM" a <input type="time">
// wants. Wall-clock, no timezone maths.
const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (t) => {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return h * 60 + m;
};

// Add / edit one availability block. Pure form: it hands values back up and the
// page talks to Supabase, so all the data logic lives in one place.
export default function AvailabilityEditor({ block, defaultDay, defaultStart, statuses, onSave, onDelete, onClose }) {
  const editing = Boolean(block?.id);
  const [day, setDay] = useState(block?.day || defaultDay);
  const [status, setStatus] = useState(block?.status || 'in_office');
  const [allDay, setAllDay] = useState(block ? block.start_min === 0 && block.end_min === 1440 : false);
  const [start, setStart] = useState(toTime(block?.start_min ?? defaultStart ?? 540)); // 9:00
  // Cap the default end at 23:59 so a <input type="time"> never gets an invalid "24:00".
  const [end, setEnd] = useState(toTime(block?.end_min ?? (defaultStart != null ? Math.min(defaultStart + 60, 1439) : 1020))); // 17:00
  const [note, setNote] = useState(block?.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    const startMin = allDay ? 0 : toMin(start);
    const endMin = allDay ? 1440 : toMin(end);
    if (endMin <= startMin) {
      setErr('End time has to be after the start.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await onSave({ day, status, start_min: startMin, end_min: endMin, note: note.trim() || null });
    } catch (e2) {
      setErr(e2.message || 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card w-full sm:max-w-[420px] rounded-t-xl3 sm:rounded-xl3 border border-line shadow-card p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[18px] font-semibold tracking-tight">
            {editing ? 'Edit availability' : 'Add availability'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-soft hover:bg-cream">
            <X size={18} weight="bold" />
          </button>
        </div>

        <form onSubmit={submit}>
          {/* Status: labelled buttons, never colour alone */}
          <label className="text-[13px] font-semibold text-ink-soft mb-1.5 block">I am</label>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {statuses.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatus(s.key)}
                className={`py-2 px-2 rounded-2xl text-[13px] font-semibold border transition-colors ${
                  status === s.key ? `${s.solid} border-transparent` : 'bg-card border-line text-ink-soft'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Day */}
          <label className="text-[13px] font-semibold text-ink-soft mb-1.5 block">Day</label>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="w-full py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[15px] mb-4"
          />

          {/* Time */}
          <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-coral w-4 h-4" />
            <span className="text-[13px] font-semibold text-ink-soft">All day</span>
          </label>
          {!allDay && (
            <div className="flex items-center gap-2 mb-4">
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="flex-1 py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[15px]"
              />
              <span className="text-ink-soft text-[13px]">to</span>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="flex-1 py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[15px]"
              />
            </div>
          )}

          {/* Note */}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional) e.g. dentist, half day"
            maxLength={120}
            className="w-full py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[15px] mb-4"
          />

          {err && <p className="text-[13px] text-red-500 mb-3">{err}</p>}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 py-2.5 rounded-2xl bg-coral text-black font-semibold shadow-cta active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {busy ? 'Saving...' : editing ? 'Save' : 'Add'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => onDelete(block)}
                aria-label="Delete"
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-red-500 border border-line hover:bg-red-50 flex-shrink-0"
              >
                <Trash size={17} weight="bold" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
