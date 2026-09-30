import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Copy, FilmSlate, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { db, isMissingTable, isMissingColumn } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { TEAM_MODE } from '@/lib/modules';
import MigrationCard from '@/components/MigrationCard';
import { shortDate } from '@/features/ai/dates';
import { sourceIdsOf, sourceLabel, briefAuthor, checkDraft } from '@/features/ai/briefs';
import { RowsSkeleton } from '@/components/Skeleton';
import { Page, PageHeader, Panel, Button, Field, Meta, EmptyState, Notice, inputCls, textareaCls } from '@/components/ui';

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

// The body around the prompt: the text before it, the prompt, the text after.
// The marker lines themselves are never shown.
function splitBrief(body = '') {
  const start = body.indexOf(PROMPT_OPEN);
  if (start === -1) return { before: body.trim(), prompt: null, after: '' };
  const end = body.indexOf(PROMPT_CLOSE, start + PROMPT_OPEN.length);
  return {
    before: body.slice(0, start).trim(),
    prompt: extractPrompt(body),
    after: end === -1 ? '' : body.slice(end + PROMPT_CLOSE.length).trim(),
  };
}

// The folded preview: the first lines, without the prompt markers.
const preview = (body = '') =>
  body
    .split('\n')
    .filter((l) => !l.includes(PROMPT_OPEN) && !l.includes(PROMPT_CLOSE))
    .join('\n');

function CopyButton({ text, label, icon = Copy }) {
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
    <Button onClick={copy} icon={state === 'copied' ? Check : icon} className={state === 'copied' ? '!text-emerald-300' : ''}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed, select the text' : label}
    </Button>
  );
}

// A brief's title and body as a form, for editing and for new briefs.
function BriefForm({ initial, saving, error, onSave, onCancel, saveLabel = 'Save', idPrefix = 'brief' }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody] = useState(initial?.body || '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ title, body });
      }}
      className="flex flex-col gap-5"
    >
      <Field label="Title" htmlFor={`${idPrefix}-title`}>
        <input id={`${idPrefix}-title`} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} maxLength={200} />
      </Field>
      <Field label="Brief" htmlFor={`${idPrefix}-body`}>
        <textarea
          id={`${idPrefix}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className={`${textareaCls} min-h-[12.5rem]`}
        />
      </Field>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving...' : saveLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
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
    <div className="mt-6">
      <p className="text-small font-medium text-ink-soft mb-1">Sources</p>
      {ids.length > 0 && (
        <ul className="divide-y divide-line">
          {ids.map((id) => {
            const ad = sourceAds.get(id);
            return (
              <li key={id}>
                {sourcesLoaded && !ad ? (
                  <span className="flex items-center min-h-[44px] text-small text-ink-soft">Deleted ad</span>
                ) : (
                  <Link
                    to={`/ad/${id}`}
                    className="flex items-center min-h-[44px] text-small text-ink hover:underline underline-offset-4 decoration-ink-soft/60"
                  >
                    <span className="truncate">{ad ? sourceLabel(ad) : 'Source ad'}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hooks.length > 0 && (
        <div className="mt-1">
          <Button variant="ghost" onClick={() => setShowHooks((v) => !v)} aria-expanded={showHooks} className="-ml-4">
            {hooks.length === 1 ? '1 hook' : `${hooks.length} hooks`}
          </Button>
          {showHooks && (
            <ul className="mt-1 flex flex-col gap-1.5">
              {hooks.map((h, i) => (
                <li key={i} className="text-body text-ink">
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
      <Page id="briefs" width="narrow">
        <PageHeader title="Briefs" />
        <MigrationCard title="Briefs" />
      </Page>
    );
  }

  const bodyText = (text) => <p className="text-body text-ink whitespace-pre-wrap select-text max-w-[68ch]">{text}</p>;

  return (
    <Page id="briefs" width="narrow">
      <PageHeader
        title="Briefs"
        context="What to make next. Write one here, or select ads or hooks and build one from them."
        actions={
          !creating && (
            <Button
              variant={editing ? 'secondary' : 'primary'}
              icon={Plus}
              onClick={() => {
                setEditing(null);
                setFormError(null);
                setCreating(true);
              }}
            >
              New brief
            </Button>
          )
        }
      />

      {creating && (
        <Panel title="New brief" className="mb-4 lg:mb-6">
          <BriefForm
            idPrefix="new-brief"
            saving={saving}
            error={formError}
            onSave={create}
            onCancel={() => setCreating(false)}
            saveLabel="Save brief"
          />
        </Panel>
      )}

      {loadError && (
        <Notice tone="bad" className="mb-4">
          {loadError}
        </Notice>
      )}

      {loading ? (
        <RowsSkeleton rows={3} />
      ) : briefs.length === 0 ? (
        !creating &&
        !loadError && (
          <Panel>
            <EmptyState title="No briefs yet." text="Write one, or select ads in the library and build one from them." />
          </Panel>
        )
      ) : (
        <div className="flex flex-col gap-4">
          {briefs.map((b) => {
            const expanded = open === b.id || editing === b.id;
            const parts = splitBrief(b.body || '');
            const prompt = parts.prompt;
            const who = briefAuthor(b, { teamMode: TEAM_MODE, displayName });
            const date = shortDate(b.created_at);
            const edited = b.updated_at ? shortDate(b.updated_at) : null;
            return (
              <section
                key={b.id}
                ref={highlight === b.id ? wantedRef : null}
                aria-label={b.title}
                className={`bg-card rounded-xl3 scroll-mt-6 transition-shadow duration-700 ${highlight === b.id ? 'ring-2 ring-accent' : ''}`}
              >
                {editing === b.id ? (
                  <div className="p-5 lg:p-6">
                    <h2 className="text-title text-ink mb-4">Edit brief</h2>
                    <BriefForm
                      idPrefix={`brief-${b.id}`}
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
                      className={`block w-full min-h-[44px] text-left px-5 lg:px-6 pt-5 lg:pt-6 rounded-xl3 ${expanded ? 'pb-4' : 'pb-5 lg:pb-6'}`}
                    >
                      <span className="block text-title text-ink">{b.title}</span>
                      <Meta
                        className="block text-small text-ink-soft mt-1"
                        items={[date, who, edited ? `edited ${edited}` : null]}
                      />
                      {!expanded && (
                        <span className="block text-body text-ink-soft line-clamp-2 whitespace-pre-line mt-3">{preview(b.body || '')}</span>
                      )}
                    </button>
                    {expanded && (
                      <div className="px-5 lg:px-6 pb-5 lg:pb-6">
                        <div className="flex flex-col gap-4">
                          {parts.before && bodyText(parts.before)}
                          {prompt && (
                            <div className="bg-white/[0.03] rounded-xl p-4 max-w-[68ch]">
                              <p className="text-small font-medium text-ink-soft mb-2">Editor prompt</p>
                              <p className="text-body text-ink whitespace-pre-wrap select-text">{prompt}</p>
                            </div>
                          )}
                          {parts.after && bodyText(parts.after)}
                        </div>
                        <Sources brief={b} sourceAds={sourceAds} sourcesLoaded={sourcesLoaded} />
                        <div className="mt-6 flex flex-wrap gap-2">
                          <CopyButton text={`${b.title}\n\n${b.body}`} label="Copy brief" />
                          {prompt && <CopyButton text={prompt} label="Copy prompt" icon={FilmSlate} />}
                          <Button variant="ghost" icon={PencilSimple} onClick={() => startEdit(b)}>
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            icon={Trash}
                            onClick={() => remove(b)}
                            className={armed === b.id ? 'bg-red-500/15' : ''}
                          >
                            {armed === b.id ? 'Tap again to delete' : 'Delete'}
                          </Button>
                        </div>
                        {rowError?.id === b.id && (
                          <Notice tone="bad" className="mt-3">
                            {rowError.message}
                          </Notice>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}
