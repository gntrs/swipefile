import React, { useId, useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { Sheet, Field, Button, IconButton, inputCls, selectedCls } from '@/components/ui';

// Convert between minutes-from-midnight and the "HH:MM" a <input type="time">
// wants. Wall-clock, no timezone maths.
const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (t) => {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return h * 60 + m;
};

// Add / edit one availability block. Pure form: it hands values back up and the
// page talks to the database, so all the data logic lives in one place. The
// Sheet closes on Escape and on the scrim.
export default function AvailabilityEditor({ block, defaultDay, defaultStart, statuses, onSave, onDelete, onClose }) {
  const editing = Boolean(block?.id);
  const formId = useId();
  const [day, setDay] = useState(block?.day || defaultDay);
  const [status, setStatus] = useState(block?.status || 'in_office');
  const [allDay, setAllDay] = useState(block ? block.start_min === 0 && block.end_min === 1440 : false);
  const [start, setStart] = useState(toTime(block?.start_min ?? defaultStart ?? 540)); // 9:00
  // Cap the default end at 23:59 so a <input type="time"> never gets an invalid "24:00".
  const [end, setEnd] = useState(toTime(block?.end_min ?? (defaultStart != null ? Math.min(defaultStart + 60, 1439) : 1020))); // 17:00
  const [note, setNote] = useState(block?.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
    <Sheet
      open
      onClose={onClose}
      sheetId="availability"
      title={editing ? 'Edit availability' : 'Add availability'}
      footer={
        <>
          {editing && (
            <IconButton label="Delete" variant="danger" icon={Trash} onClick={() => onDelete(block)} className="mr-auto -ml-3" />
          )}
          <Button type="submit" form={formId} variant="primary" disabled={busy} className="min-w-[7rem]">
            {busy ? 'Saving...' : editing ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        {/* Status: labelled buttons, never colour alone */}
        <div role="group" aria-labelledby={`${formId}-status`}>
          <p id={`${formId}-status`} className="text-small font-medium text-ink mb-2">
            I am
          </p>
          <div className="grid grid-cols-3 gap-2">
            {statuses.map((s) => {
              const on = status === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStatus(s.key)}
                  className={`press inline-flex items-center justify-center gap-2 min-h-[44px] px-2 rounded-xl text-ui font-medium transition-colors ${
                    on ? selectedCls : 'bg-white/[0.04] text-ink-soft hover:text-ink'
                  }`}
                >
                  <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Day" htmlFor={`${formId}-day`}>
          <input id={`${formId}-day`} type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputCls} />
        </Field>

        <div>
          {/* The whole 44 tall label is the tap target, so the probe skips the box. */}
          <label className="-ml-1 inline-flex items-center gap-3 min-h-[44px] px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="accent-accent w-5 h-5"
              data-probe-skip
            />
            <span className="text-ui font-medium text-ink">All day</span>
          </label>
          {!allDay && (
            <div className="flex items-center gap-3 mt-2">
              <input
                type="time"
                aria-label="From"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={`${inputCls} flex-1`}
              />
              <span className="text-small text-ink-soft">to</span>
              <input
                type="time"
                aria-label="Until"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={`${inputCls} flex-1`}
              />
            </div>
          )}
        </div>

        <Field label="Note" htmlFor={`${formId}-note`}>
          <input
            id={`${formId}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional, e.g. dentist, half day"
            maxLength={120}
            className={inputCls}
          />
        </Field>

        {err && (
          <p role="alert" className="text-small text-red-300">
            {err}
          </p>
        )}
      </form>
    </Sheet>
  );
}
