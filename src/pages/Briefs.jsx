import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Copy, FileText, FilmSlate, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { db, isMissingTable, isMissingColumn } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { TEAM_MODE } from '@/lib/modules';
import MigrationCard from '@/components/MigrationCard';
import { shortDate } from '@/features/ai/dates';
import { sourceIdsOf, sourceLabel, briefAuthor, checkDraft } from '@/features/ai/briefs';

// A brief can carry a ready-to-paste prompt for an AI video editor, fenced off
// from the prose so it survives the round trip to the tool intact. Everything
// between the markers is the prompt; the markers themselves are dropped.
const PROMPT_OPEN = '>>> AI EDITOR PROMPT';
const PROMPT_CLOSE = '<<< END PROMPT';

export function extractPrompt(body = '') {
  const start = body.indexOf(PROMPT_OPEN);
  if (start === -1) return null;
  const from = start + PROMPT_OPEN.length;
  const end = body.indexOf(PROMPT_CLOSE, from);
  const block = (end === -1 ? body.slice(from) : body.slice(from, end)).trim();
  return block || null;
}

const kicker = 'font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft';
const actionBase =
  'press inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-2xl border text-[13px] font-semibold disabled:opacity-60';
const actionBtn = `${actionBase} border-line text-ink-soft hover:text-ink`;
const primaryBtn =
  'press inline-flex items-center justify-center min-h-[44px] px-4 rounded-2xl bg-accent text-black text-[14px] font-semibold disabled:opacity-60';
const inputCls =
  'w-full min-h-[44px] px-3 py-2.5 rounded-2xl border border-line bg-canvas text-[16px] focus:outline-none focus:border-accent';

function CopyButton({ text, label, icon: Icon = Copy }) {
  const [state, setState] = useState('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 1200);
    } catch {
      setState('failed');
    }
  };
  return (
    <button type="button" onClick={copy} className={state === 'copied' ? `${actionBase} border-line text-emerald-600` : actionBtn}>
      {state === 'copied' ? <Check size={14} weight="bold" /> : <Icon size={14} weight="bold" />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed, select the text' : label}
    </button>
  );
}

// A brief's title and body as a form, for editing and for new briefs.
function BriefForm({ initial, saving, error, onSave, onCancel, saveLabel = 'Save' }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody] = useState(initial?.body || '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ title, body });
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className={kicker}>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} maxLength={200} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={kicker}>Brief</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className={`${inputCls} leading-relaxed min-h-[200px] resize-y`}
        />
      </label>
      {error && (
        <p role="alert" className="text-[14px] text-red-600 leading-relaxed">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={primaryBtn}>
          {saving ? 'Saving...' : saveLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={actionBtn}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Sources({ brief, sourceAds, sourcesLoaded }) {
  const [showHooks, setShowHooks] = useState(false);
  const ids = Array.isArray(brief.source_ad_ids) ? brief.source_ad_ids : [];
  const hooks = Array.isArray(brief.source_hooks) ? brief.source_hooks.filter(Boolean) : [];
  if (!ids.length && !hooks.length) return null;
  return (
    <div className="mt-4">
      <p className={`${kicker} mb-2`}>Sources</p>
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => {
            const ad = sourceAds.get(id);
            if (sourcesLoaded && !ad) {
              return (
                <span key={id} className="inline-flex items-center min-h-[44px] px-3 rounded-2xl border border-dashed border-line text-[13px] text-ink-soft">
                  Deleted ad
                </span>
              );
            }
            return (
              <Link
                key={id}
                to={`/ad/${id}`}
                className="press inline-flex items-center min-h-[44px] max-w-full px-3 rounded-2xl bg-canvas border border-line text-[13px] text-ink hover:border-accent"
              >
                <span className="truncate">{ad ? sourceLabel(ad) : 'Source ad'}</span>
              </Link>
            );
          })}
        </div>
      )}
      {hooks.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHooks((v) => !v)}
            aria-expanded={showHooks}
            className="press inline-flex items-center min-h-[44px] px-3 -ml-3 rounded-2xl text-[13px] font-semibold text-ink-soft hover:text-ink"
          >
            {hooks.length === 1 ? '1 hook' : `${hooks.length} hooks`}
          </button>
          {showHooks && (
            <ul className="mt-1 flex flex-col gap-1.5">
              {hooks.map((h, i) => (
                <li key={i} className="text-[15px] leading-relaxed">
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Briefs for the next round of ads: written here by hand, built by AI from a
// selection, or added with scripts/add-brief.mjs. Newest first; the newest one
// (or the one in ?open=<id>) is open, older ones fold up.
export default function Briefs() {
  const { user } = useAuth();
  const { displayName } = useTeam();
  const [params] = useSearchParams();
  const wanted = params.get('open');
  const [briefs, setBriefs] = useState([]);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [sourceAds, setSourceAds] = useState(new Map());
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [armed, setArmed] = useState(null); // id waiting for the second delete tap
  const [rowError, setRowError] = useState(null); // { id, message }
  const wantedRef = useRef(null);
  const armTimer = useRef(null);

  useEffect(() => {
    let mounted = true;
    db
      .from('briefs')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error && isMissingTable(error)) setMissing(true);
        else if (error) setLoadError(`Could not load briefs: ${error.message || 'unknown error'}. Reload to try again.`);
        const rows = data || [];
        setBriefs(rows);
        const target = wanted && rows.some((b) => b.id === wanted) ? wanted : rows[0]?.id;
        setOpen(target || null);
        if (wanted && target === wanted) setHighlight(wanted);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One lookup for every source ad on the page.
  const idsKey = sourceIdsOf(briefs).sort().join(',');
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    const known = ids.filter((id) => sourceAds.has(id));
    if (!ids.length || known.length === ids.length) {
      setSourcesLoaded(true);
      return undefined;
    }
    let mounted = true;
    db
      .from('ads')
      .select('id, brand, hook')
      .in('id', ids)
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          setSourcesLoaded(false);
          return;
        }
        setSourceAds(new Map((data || []).map((a) => [a.id, a])));
        setSourcesLoaded(true);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Scroll the deep-linked brief into view, let the highlight fade.
  useEffect(() => {
    if (!highlight) return undefined;
    wantedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const t = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(t);
  }, [highlight, loading]);

  useEffect(() => () => clearTimeout(armTimer.current), []);

  const startEdit = (b) => {
    setCreating(false);
    setFormError(null);
    setEditing(b.id);
    setOpen(b.id);
  };

  const saveEdit = async (b, draft) => {
    const checked = checkDraft(draft);
    if (!checked.ok) {
      setFormError(checked.message);
      return;
    }
    setSaving(true);
    setFormError(null);
    const full = {
      title: checked.title,
      body: checked.body,
      updated_at: new Date().toISOString(),
      updated_by_email: user?.email || null,
    };
    let { error } = await db.from('briefs').update(full).eq('id', b.id);
    let patch = full;
    if (error && isMissingColumn(error)) {
      patch = { title: checked.title, body: checked.body };
      ({ error } = await db.from('briefs').update(patch).eq('id', b.id));
    }
    setSaving(false);
    if (error) {
      setFormError(`Could not save: ${error.message || 'unknown error'}. Your text is still here.`);
      return;
    }
    setBriefs((list) => list.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
    setEditing(null);
  };

  const create = async (draft) => {
    const checked = checkDraft(draft);
    if (!checked.ok) {
      setFormError(checked.message);
      return;
    }
    setSaving(true);
    setFormError(null);
    const { data, error } = await db
      .from('briefs')
      .insert({ title: checked.title, body: checked.body, added_by_email: user?.email || null })
      .select()
      .single();
    setSaving(false);
    if (error) {
      setFormError(`Could not save: ${error.message || 'unknown error'}. Your text is still here.`);
      return;
    }
    setBriefs((list) => [data, ...list]);
    setOpen(data.id);
    setCreating(false);
  };

  const remove = async (b) => {
    if (armed !== b.id) {
      setArmed(b.id);
      setRowError(null);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(null), 4000);
      return;
    }
    clearTimeout(armTimer.current);
    setArmed(null);
    const { error } = await db.from('briefs').delete().eq('id', b.id);
    if (error) {
      setRowError({ id: b.id, message: `Could not delete: ${error.message || 'unknown error'}.` });
      return;
    }
    setBriefs((list) => list.filter((x) => x.id !== b.id));
    if (open === b.id) setOpen(null);
  };

  if (missing) {
    return (
      <div data-page="briefs" className="px-5 sm:px-8 py-6 max-w-[720px] mx-auto">
        <MigrationCard title="Briefs" />
      </div>
    );
  }

  return (
    <div data-page="briefs" className="px-5 sm:px-8 py-6 max-w-[720px] mx-auto">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">Briefs</h1>
          <p className="text-ink-soft text-[15px] leading-relaxed">
            What to make next. Write one here, or select ads or hooks and build one from them.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormError(null);
              setCreating(true);
            }}
            className={`${primaryBtn} gap-1.5 flex-shrink-0`}
          >
            <Plus size={16} weight="bold" />
            New brief
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-card rounded-xl3 border border-line p-4 mb-4">
          <p className={`${kicker} mb-3`}>New brief</p>
          <BriefForm saving={saving} error={formError} onSave={create} onCancel={() => setCreating(false)} saveLabel="Save brief" />
        </div>
      )}

      {loadError && (
        <p role="alert" className="mb-4 text-[15px] text-red-600 leading-relaxed">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="text-ink-soft">Loading...</p>
      ) : briefs.length === 0 ? (
        !creating && !loadError && (
          <div className="text-center py-20 text-ink-soft">
            <FileText size={32} className="mx-auto mb-2" />
            <p className="text-[15px]">No briefs yet. Write one, or select ads in the library and build one.</p>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {briefs.map((b) => {
            const expanded = open === b.id || editing === b.id;
            const prompt = extractPrompt(b.body || '');
            const who = briefAuthor(b, { teamMode: TEAM_MODE, displayName });
            const date = shortDate(b.created_at);
            const edited = b.updated_at ? shortDate(b.updated_at) : null;
            return (
              <div
                key={b.id}
                ref={highlight === b.id ? wantedRef : null}
                className={`bg-card rounded-xl3 border shadow-card scroll-mt-6 transition-all duration-700 ${
                  highlight === b.id ? 'border-accent ring-2 ring-accent/40' : 'border-line'
                }`}
              >
                {editing === b.id ? (
                  <div className="p-4">
                    <p className={`${kicker} mb-3`}>Edit brief</p>
                    <BriefForm
                      initial={b}
                      saving={saving}
                      error={formError}
                      onSave={(draft) => saveEdit(b, draft)}
                      onCancel={() => {
                        setEditing(null);
                        setFormError(null);
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : b.id)}
                      aria-expanded={expanded}
                      className="block w-full min-h-[44px] text-left px-4 pt-4 pb-2"
                    >
                      <p className="font-semibold text-[17px] leading-snug tracking-tight">{b.title}</p>
                      <p className="font-mono text-[12px] text-ink-soft mt-1">
                        {[date, who, edited ? `edited ${edited}` : null].filter(Boolean).join(' · ')}
                      </p>
                    </button>
                    {expanded ? (
                      <div className="px-4 pb-4">
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap select-text">{b.body}</p>
                        <Sources brief={b} sourceAds={sourceAds} sourcesLoaded={sourcesLoaded} />
                        <div className="mt-4 flex flex-wrap gap-2">
                          <CopyButton text={`${b.title}\n\n${b.body}`} label="Copy brief" />
                          {prompt && <CopyButton text={prompt} label="Copy prompt" icon={FilmSlate} />}
                          <button type="button" onClick={() => startEdit(b)} className={actionBtn}>
                            <PencilSimple size={14} weight="bold" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(b)}
                            className={armed === b.id ? `${actionBase} border-red-600 text-red-600` : actionBtn}
                          >
                            <Trash size={14} weight="bold" />
                            {armed === b.id ? 'Tap again to delete' : 'Delete'}
                          </button>
                        </div>
                        {rowError?.id === b.id && (
                          <p role="alert" className="mt-2 text-[14px] text-red-600">
                            {rowError.message}
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpen(b.id)}
                        className="block w-full min-h-[44px] text-left px-4 pb-4"
                      >
                        <p className="text-[15px] text-ink-soft line-clamp-2 whitespace-pre-wrap">{b.body}</p>
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
