import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, FileText, FilmSlate } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useTeam } from '@/contexts/TeamContext';
import { isMissingTable } from '@/lib/db';
import MigrationCard from '@/components/MigrationCard';

function CopyButton({ text, label = 'Copy', icon: Icon = Copy, accent = false }) {
  const [copied, setCopied] = useState(false);
  const idle = accent
    ? 'bg-coral/12 text-coral hover:bg-coral/20'
    : 'bg-cream text-ink-soft hover:text-ink';
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      aria-label={`${label} brief`}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold flex-shrink-0 transition-colors ${
        copied ? 'bg-mint/40 text-emerald-700' : idle
      }`}
    >
      {copied ? <Check size={14} weight="bold" /> : <Icon size={14} weight="bold" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

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

// Claude's analysis summaries, one card per brief. Written from Claude Code
// via scripts/add-brief.mjs; the newest one is open, older ones fold up.
export default function Briefs() {
  const { displayName } = useTeam();
  // /briefs?open=<id> (from a linked goal) opens that brief highlighted.
  const [params] = useSearchParams();
  const wanted = params.get('open');
  const [briefs, setBriefs] = useState([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const wantedRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    db
      .from('briefs')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error && isMissingTable(error)) setMissing(true);
        setBriefs(data || []);
        const target = wanted && data?.some((b) => b.id === wanted) ? wanted : data?.[0]?.id;
        setOpen(target || null);
        if (wanted && target === wanted) setHighlight(wanted);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll the deep-linked brief into view, let the highlight fade.
  useEffect(() => {
    if (!highlight) return;
    wantedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const t = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(t);
  }, [highlight, loading]);

  if (missing) return (
    <div className="px-5 sm:px-8 py-6 max-w-[720px] mx-auto">
      <MigrationCard title="Briefs" />
    </div>
  );

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[720px] mx-auto">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Briefs</h1>
        <p className="text-ink-soft text-[14px]">
          Every analysis Claude runs lands here, so nothing gets forgotten.
        </p>
      </div>

      {loading ? (
        <p className="text-ink-soft">Loading...</p>
      ) : briefs.length === 0 ? (
        <div className="text-center py-20 text-ink-soft">
          <FileText size={32} className="mx-auto mb-2" />
          <p>No briefs yet. The next analysis will show up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {briefs.map((b) => {
            const expanded = open === b.id;
            const prompt = extractPrompt(b.body);
            return (
              <div
                key={b.id}
                ref={highlight === b.id ? wantedRef : null}
                className={`bg-card rounded-xl3 border shadow-card scroll-mt-6 transition-all duration-700 ${
                  highlight === b.id ? 'border-coral ring-2 ring-coral/40' : 'border-line'
                }`}
              >
                <div className="flex items-start gap-3 px-4 pt-4 pb-2">
                  <button
                    onClick={() => setOpen(expanded ? null : b.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="font-semibold text-[16px] leading-snug">{b.title}</p>
                    <p className="text-[12px] text-ink-soft mt-0.5">
                      {new Date(b.created_at).toLocaleDateString()} ·{' '}
                      {b.added_by_email === 'claude@analysis'
                        ? 'Claude'
                        : displayName(b.added_by_email)}
                    </p>
                  </button>
                  {prompt && (
                    <CopyButton text={prompt} label="Prompt" icon={FilmSlate} accent />
                  )}
                  <CopyButton text={`${b.title}\n\n${b.body}`} />
                </div>
                {expanded ? (
                  <div className="px-4 pb-4">
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap select-text">
                      {b.body}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => setOpen(b.id)}
                    className="block w-full text-left px-4 pb-4"
                  >
                    <p className="text-[13px] text-ink-soft line-clamp-2 whitespace-pre-wrap">
                      {b.body}
                    </p>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
