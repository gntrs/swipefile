import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DotsThreeOutline, Scales, Star, Tag, Trash, X } from '@phosphor-icons/react';
import { bulkVerdict, bulkStar, bulkTags, bulkDelete, MAX_SELECT } from '@/lib/library/bulk';
import { RECENT_TAG } from '@/lib/ads';
import BriefFromSelection from '@/features/ai/BriefFromSelection';

const VERDICT_ACTIONS = [
  { id: 'winner', label: 'Winner' },
  { id: 'testing', label: 'Testing' },
  { id: 'loser', label: 'Loser' },
  { id: 'unsure', label: 'Unsure' },
];

// Colour lives apart from shape, so the delete button can swap it whole.
const btnShape =
  'press inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-xl text-[14px] font-semibold transition-colors disabled:opacity-40';
const rowShape =
  'press w-full flex items-center gap-3 min-h-[48px] px-4 rounded-xl text-[15px] font-medium text-left disabled:opacity-40';
const quiet = 'bg-white/[0.06] hover:bg-white/[0.1] text-ink';
const danger = (armed) => (armed ? 'bg-red-500 text-white' : 'bg-white/[0.06] hover:bg-white/[0.1] text-red-600');
const btn = `${btnShape} ${quiet}`;
const row = `${rowShape} ${quiet}`;
const input =
  'min-h-[44px] min-w-0 px-3 rounded-xl border border-line bg-canvas text-[14px] focus:outline-none focus:border-accent';

// What a finished action says. failed lists { id, message }.
function resultText(kind, arg, done, failed) {
  const n = done.toLocaleString('en-US');
  if (failed.length) {
    const verb = kind === 'delete' ? 'Deleted' : 'Updated';
    return `${verb} ${n}. ${failed.length} failed: ${String(failed[0].message).replace(/\.$/, '')}.`;
  }
  if (kind === 'verdict') return `Marked ${n} as ${arg}.`;
  if (kind === 'star') return arg ? `Starred ${n}.` : `Unstarred ${n}.`;
  if (kind === 'add') return `Tagged ${n} with ${arg}.`;
  if (kind === 'remove') return `Removed ${arg} from ${n}.`;
  if (kind === 'delete') return `Deleted ${n}.`;
  return `Updated ${n}.`;
}

// The bar under the library while ads are selected: one action for all of
// them. Pinned above the phone tab bar and clear of the sidebar from sm up.
// On phones the actions live in a bottom sheet behind Actions.
export default function BulkBar({ selected = [], active = false, pageCount = 0, full = false, onSelectPage, onClear, onRowsChanged, onDeleted, onChanged }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(null); // { kind, arg, ids }
  const [sheet, setSheet] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [removeTag, setRemoveTag] = useState('');
  const [armed, setArmed] = useState(false);
  const armTimer = useRef(null);

  const count = selected.length;
  const ids = useMemo(() => selected.map((a) => a.id), [selected]);
  const presentTags = useMemo(() => {
    const out = [];
    for (const a of selected) for (const t of a.tags || []) if (t && t !== RECENT_TAG && !out.includes(t)) out.push(t);
    return out.sort((a, b) => a.localeCompare(b));
  }, [selected]);

  useEffect(() => () => clearTimeout(armTimer.current), []);
  useEffect(() => {
    if (removeTag && !presentTags.includes(removeTag)) setRemoveTag('');
  }, [presentTags, removeTag]);

  const run = async (kind, arg, targets = selected) => {
    if (busy || !targets.length) return;
    setSheet(false);
    setMessage('');
    setRetry(null);
    const total = targets.length.toLocaleString('en-US');
    setBusy(kind === 'delete' ? `Deleting ${total}...` : `Updating ${total}...`);
    let r;
    if (kind === 'verdict') r = await bulkVerdict(targets, arg);
    else if (kind === 'star') r = await bulkStar(targets, arg);
    else if (kind === 'add') r = await bulkTags(targets, { add: [arg] });
    else if (kind === 'remove') r = await bulkTags(targets, { remove: [arg] });
    else r = await bulkDelete(targets);
    setBusy('');
    if (kind === 'delete') onDeleted?.(r.rows.map((a) => a.id));
    else if (r.rows.length) onRowsChanged?.(r.rows);
    onChanged?.();
    setMessage(resultText(kind, arg, r.done, r.failed));
    if (r.failed.length) setRetry({ kind, arg, ids: r.failed.map((f) => f.id) });
    if (kind === 'add') setTagDraft('');
    if (kind === 'remove') setRemoveTag('');
  };

  const retryFailed = () => {
    if (!retry) return;
    const targets = selected.filter((a) => retry.ids.includes(a.id));
    run(retry.kind, retry.arg, targets);
  };

  const onDelete = () => {
    if (!armed) {
      setArmed(true);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    clearTimeout(armTimer.current);
    setArmed(false);
    run('delete');
  };

  const addTag = (e) => {
    e?.preventDefault();
    const t = tagDraft.trim();
    if (t) run('add', t);
  };

  const canCompare = count >= 2 && count <= 4;
  const compare = () => navigate(`/compare?ids=${ids.join(',')}`);
  const deleteLabel = armed ? `Tap again to delete ${count.toLocaleString('en-US')}` : 'Delete';
  // Actions need something selected; Select page and Clear do not.
  const disabled = Boolean(busy) || count === 0;

  if (!count && !active) return null;

  return (
    <>
      <div data-bulk-bar className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-0 sm:left-60 z-40 px-3 sm:px-6 pb-2 sm:pb-[calc(1rem+env(safe-area-inset-bottom))] pointer-events-none">
        <div className="pointer-events-auto max-w-[1100px] mx-auto bg-card border border-line rounded-xl3 shadow-cardhover p-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[13px] tabular-nums text-ink px-2 min-h-[44px] flex items-center">
              {count.toLocaleString('en-US')} selected
            </p>
            <button type="button" onClick={onSelectPage} disabled={Boolean(busy) || full || !pageCount} className={`${btn} hidden sm:inline-flex`}>
              Select page
            </button>
            <button type="button" onClick={() => setSheet(true)} disabled={Boolean(busy)} className={`${btn} sm:hidden ml-auto`} aria-haspopup="true">
              <DotsThreeOutline size={16} weight="bold" /> Actions
            </button>
            <button type="button" onClick={onClear} disabled={disabled} className={`${btn} sm:ml-auto`} aria-label="Clear selection">
              <X size={16} weight="bold" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>

          {/* Inline actions from sm up. */}
          <div className="hidden sm:flex flex-wrap items-center gap-2 mt-2">
            {VERDICT_ACTIONS.map((v) => (
              <button key={v.id} type="button" disabled={disabled} onClick={() => run('verdict', v.id)} className={btn}>
                {v.label}
              </button>
            ))}
            <span className="w-px self-stretch bg-line mx-1" />
            <button type="button" disabled={disabled} onClick={() => run('star', true)} className={btn}>
              <Star size={15} weight="fill" className="text-amber-400" /> Star
            </button>
            <button type="button" disabled={disabled} onClick={() => run('star', false)} className={btn}>
              <Star size={15} weight="bold" /> Unstar
            </button>
            <form onSubmit={addTag} className="flex items-center gap-1.5">
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="New tag"
                aria-label="Tag to add"
                maxLength={60}
                className={`${input} w-[120px]`}
              />
              <button type="submit" disabled={disabled || !tagDraft.trim()} className={btn}>
                <Tag size={15} weight="bold" /> Add
              </button>
            </form>
            {presentTags.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select value={removeTag} onChange={(e) => setRemoveTag(e.target.value)} aria-label="Tag to remove" className={`${input} max-w-[160px]`}>
                  <option value="">Remove tag...</option>
                  {presentTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={disabled || !removeTag} onClick={() => run('remove', removeTag)} className={btn}>
                  Remove
                </button>
              </div>
            )}
            <span className="w-px self-stretch bg-line mx-1" />
            <button type="button" disabled={disabled || !canCompare} onClick={compare} className={btn} title="Compare 2 to 4 ads">
              <Scales size={15} weight="bold" /> Compare
            </button>
            <BriefFromSelection adIds={ids} label="Brief from these" />
            <button
              type="button"
              disabled={disabled}
              onClick={onDelete}
              className={`${btnShape} ${danger(armed)}`}
            >
              <Trash size={15} weight="bold" /> {deleteLabel}
            </button>
          </div>

          {(busy || message || full) && (
            <div className="flex flex-wrap items-center gap-2 px-2 pt-1">
              <p aria-live="polite" className="flex-1 min-w-0 text-[14px] text-ink-soft py-2">
                {busy || message || (full ? `Selection is full (${MAX_SELECT}).` : '')}
              </p>
              {retry && !busy && (
                <button type="button" onClick={retryFailed} className={btn}>
                  Retry failed
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Phone sheet with the same actions as full width rows. */}
      {sheet && (
        <div className="sm:hidden fixed inset-0 z-[60] flex items-end">
          <div aria-hidden="true" className="absolute inset-0 bg-black/60 animate-fade" onClick={() => setSheet(false)} />
          <div
            data-sheet="bulk"
            className="relative w-full max-h-[85%] overflow-y-auto overscroll-contain bg-card rounded-t-3xl px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-sheet-up"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="kicker">{count.toLocaleString('en-US')} selected</span>
              <button
                type="button"
                onClick={() => setSheet(false)}
                aria-label="Close"
                className="press w-11 h-11 -mr-1.5 rounded-full bg-white/[0.06] flex items-center justify-center text-ink-soft hover:text-ink"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
            <div className="grid gap-2">
              <button type="button" onClick={() => { setSheet(false); onSelectPage?.(); }} disabled={full || !pageCount} className={row}>
                Select page
              </button>
              <div className="grid grid-cols-2 gap-2">
                {VERDICT_ACTIONS.map((v) => (
                  <button key={v.id} type="button" disabled={disabled} onClick={() => run('verdict', v.id)} className={row}>
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={disabled} onClick={() => run('star', true)} className={row}>
                  <Star size={18} weight="fill" className="text-amber-400" /> Star
                </button>
                <button type="button" disabled={disabled} onClick={() => run('star', false)} className={row}>
                  <Star size={18} weight="bold" /> Unstar
                </button>
              </div>
              <form onSubmit={addTag} className="flex gap-2">
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  placeholder="New tag"
                  aria-label="Tag to add"
                  maxLength={60}
                  className={`${input} flex-1 text-[16px]`}
                />
                <button type="submit" disabled={disabled || !tagDraft.trim()} className={btn}>
                  Add tag
                </button>
              </form>
              {presentTags.length > 0 && (
                <div className="flex gap-2">
                  <select value={removeTag} onChange={(e) => setRemoveTag(e.target.value)} aria-label="Tag to remove" className={`${input} flex-1 text-[16px]`}>
                    <option value="">Remove tag...</option>
                    {presentTags.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={!removeTag} onClick={() => run('remove', removeTag)} className={btn}>
                    Remove
                  </button>
                </div>
              )}
              <button type="button" disabled={!canCompare} onClick={compare} className={row}>
                <Scales size={18} weight="bold" /> Compare {canCompare ? count : '(2 to 4 ads)'}
              </button>
              <BriefFromSelection adIds={ids} label="Brief from these" className="w-full min-h-[48px]" />
              <button type="button" disabled={disabled} onClick={onDelete} className={`${rowShape} ${danger(armed)}`}>
                <Trash size={18} weight="bold" /> {deleteLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
