import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DotsThreeOutline, Scales, Star, Tag, Trash, X } from '@phosphor-icons/react';
import { Button, IconButton, Sheet, Field, inputCls, selectCls, useIsDesktop } from '@/components/ui';
import { bulkVerdict, bulkStar, bulkTags, bulkDelete, MAX_SELECT } from '@/lib/library/bulk';
import { RECENT_TAG } from '@/lib/ads';
import BriefFromSelection from '@/features/ai/BriefFromSelection';

const VERDICT_ACTIONS = [
  { id: 'winner', label: 'Winner' },
  { id: 'testing', label: 'Testing' },
  { id: 'loser', label: 'Loser' },
  { id: 'unsure', label: 'Unsure' },
];

// The delete button turns solid red once armed: the second tap deletes.
const ARMED = '!bg-red-500 !text-white';
// Quiet buttons in the lg bar run a little tighter so the whole bar is one row
// at 1440.
const TIGHT = '!px-3';

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
// them. Pinned above the phone tab bar and clear of the sidebar. From lg the
// actions sit in the bar (tags in their own small sheet); under lg they live
// in a bottom sheet behind Actions.
export default function BulkBar({ selected = [], active = false, pageCount = 0, full = false, onSelectPage, onClear, onRowsChanged, onDeleted, onChanged }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(null); // { kind, arg, ids }
  const [sheet, setSheet] = useState(false);
  const [tagSheet, setTagSheet] = useState(false);
  const desktop = useIsDesktop();
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
    setTagSheet(false);
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

  const countText = (
    <p className="flex items-center min-h-[44px] px-2 text-ui text-ink whitespace-nowrap">
      <span className="num text-ui mr-1.5">{count.toLocaleString('en-US')}</span> selected
    </p>
  );

  // Add a tag to every selected ad, or take one off. Shared by the tags sheet
  // (lg) and the actions sheet (phone).
  const tagControls = (
    <div className="grid gap-5">
      <form onSubmit={addTag}>
        <Field label="Add a tag" htmlFor="bulk-tag-add">
          <div className="flex gap-2">
            <input
              id="bulk-tag-add"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="New tag"
              aria-label="Tag to add"
              maxLength={60}
              className={`${inputCls} flex-1 min-w-0`}
            />
            <Button type="submit" icon={Tag} disabled={disabled || !tagDraft.trim()}>
              Add
            </Button>
          </div>
        </Field>
      </form>
      {presentTags.length > 0 && (
        <Field label="Remove a tag" htmlFor="bulk-tag-remove">
          <div className="flex gap-2">
            <select
              id="bulk-tag-remove"
              value={removeTag}
              onChange={(e) => setRemoveTag(e.target.value)}
              aria-label="Tag to remove"
              className={`${selectCls} flex-1 min-w-0`}
            >
              <option value="">Pick a tag...</option>
              {presentTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button disabled={disabled || !removeTag} onClick={() => run('remove', removeTag)}>
              Remove
            </Button>
          </div>
        </Field>
      )}
    </div>
  );

  return (
    <>
      <div
        data-bulk-bar
        className="fixed bottom-[var(--tabbar-h)] left-[var(--nav-left)] right-0 z-40 px-3 lg:px-[var(--gutter)] pb-2 lg:pb-[calc(1rem+env(safe-area-inset-bottom))] pointer-events-none"
      >
        <div className="pointer-events-auto mx-auto max-w-[calc(var(--maxw)_-_2*var(--gutter))] bg-card border border-line rounded-xl3 shadow-cardhover p-2">
          {desktop ? (
            <div className="flex flex-wrap items-center gap-1">
              {countText}
              <Button variant="ghost" onClick={onSelectPage} disabled={Boolean(busy) || full || !pageCount} className={TIGHT}>
                Select page
              </Button>
              <select
                value=""
                onChange={(e) => e.target.value && run('verdict', e.target.value)}
                disabled={disabled}
                aria-label="Set verdict"
                className="min-h-[44px] rounded-xl bg-white/[0.03] border border-line pl-3.5 pr-2 text-ui text-ink cursor-pointer disabled:opacity-50"
              >
                <option value="">Set verdict...</option>
                {VERDICT_ACTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                icon={<Star size={16} weight="fill" aria-hidden="true" className="flex-shrink-0 text-amber-400" />}
                disabled={disabled}
                onClick={() => run('star', true)}
                className={TIGHT}
              >
                Star
              </Button>
              <Button variant="ghost" disabled={disabled} onClick={() => run('star', false)} className={TIGHT}>
                Unstar
              </Button>
              <Button disabled={disabled} onClick={() => setTagSheet(true)} aria-haspopup="dialog">
                Tags
              </Button>
              <Button disabled={disabled || !canCompare} onClick={compare} title="Compare 2 to 4 ads">
                Compare
              </Button>
              <BriefFromSelection adIds={ids} label="Brief from these" />
              <Button variant="danger" icon={Trash} disabled={disabled} onClick={onDelete} className={`${TIGHT} ${armed ? ARMED : ''}`}>
                {deleteLabel}
              </Button>
              <IconButton label="Clear selection" icon={X} onClick={onClear} disabled={disabled} className="ml-auto" />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {countText}
              <Button
                icon={Scales}
                disabled={disabled || !canCompare}
                onClick={compare}
                aria-label="Compare"
                title="Compare 2 to 4 ads"
                className="ml-auto"
              >
                <span className="hidden sm:inline">Compare</span>
              </Button>
              <Button icon={DotsThreeOutline} onClick={() => setSheet(true)} disabled={Boolean(busy)} aria-haspopup="dialog">
                Actions
              </Button>
              <IconButton label="Clear selection" icon={X} onClick={onClear} disabled={disabled} />
            </div>
          )}

          {(busy || message || full) && (
            <div className="flex flex-wrap items-center gap-2 px-2 pt-1">
              <p aria-live="polite" className="flex-1 min-w-0 text-small text-ink-soft py-2">
                {busy || message || (full ? `Selection is full (${MAX_SELECT}).` : '')}
              </p>
              {retry && !busy && <Button onClick={retryFailed}>Retry failed</Button>}
            </div>
          )}
        </div>
      </div>

      {/* lg: the tag actions, one small sheet. */}
      <Sheet open={desktop && tagSheet} onClose={() => setTagSheet(false)} title="Tags" sheetId="bulk-tags">
        <p className="text-small text-ink-soft mb-4">
          For the {count.toLocaleString('en-US')} selected {count === 1 ? 'ad' : 'ads'}.
        </p>
        {tagControls}
      </Sheet>

      {/* Phone and tablet: every action as a full width row. */}
      <Sheet open={!desktop && sheet} onClose={() => setSheet(false)} title={`${count.toLocaleString('en-US')} selected`} sheetId="bulk">
        <div className="grid gap-5">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setSheet(false);
              onSelectPage?.();
            }}
            disabled={full || !pageCount}
          >
            Select page
          </Button>
          <div>
            <p className="text-small font-medium text-ink mb-2">Verdict</p>
            <div className="grid grid-cols-2 gap-2">
              {VERDICT_ACTIONS.map((v) => (
                <Button key={v.id} disabled={disabled} onClick={() => run('verdict', v.id)} className="w-full">
                  {v.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-small font-medium text-ink mb-2">Star</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                icon={<Star size={16} weight="fill" aria-hidden="true" className="flex-shrink-0 text-amber-400" />}
                disabled={disabled}
                onClick={() => run('star', true)}
                className="w-full"
              >
                Star
              </Button>
              <Button icon={Star} disabled={disabled} onClick={() => run('star', false)} className="w-full">
                Unstar
              </Button>
            </div>
          </div>
          {tagControls}
          <div className="grid gap-2 pt-1">
            <Button icon={Scales} disabled={!canCompare} onClick={compare} className="w-full">
              Compare {canCompare ? count : '(2 to 4 ads)'}
            </Button>
            <BriefFromSelection adIds={ids} label="Brief from these" className="w-full" />
            <Button variant="danger" icon={Trash} disabled={disabled} onClick={onDelete} className={`w-full ${armed ? ARMED : ''}`}>
              {deleteLabel}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
