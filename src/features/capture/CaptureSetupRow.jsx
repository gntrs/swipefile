import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Info } from '@phosphor-icons/react';
import { db, DB_MODE } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import CopyButton from './CopyButton';

const LEVELS = {
  ok: { icon: CheckCircle, label: 'OK', tone: 'text-emerald-600' },
  info: { icon: Info, label: 'Info', tone: 'text-ink-soft' },
};

// Same shape as the rows the Setup page draws for its own checks.
function Row({ level, title, detail, fix, children }) {
  const { icon: Icon, label, tone } = LEVELS[level];
  return (
    <li className="py-5 border-b border-line last:border-b-0">
      <div className="flex items-start gap-3">
        <Icon size={22} weight="bold" className={`${tone} flex-shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-snug">{title}</p>
          <p className={`font-mono text-[11px] uppercase tracking-[0.12em] mt-1.5 ${tone}`}>{label}</p>
          {detail && <p className="text-[15px] text-ink-soft leading-relaxed mt-2">{detail}</p>}
          {fix && (
            <div className="mt-3 flex items-start gap-2">
              <code className="flex-1 min-w-0 block bg-canvas rounded-lg px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
                {fix}
              </code>
              <CopyButton text={fix} ariaLabel="Copy the command" />
            </div>
          )}
          {children}
        </div>
      </div>
    </li>
  );
}

// The capture rows in the setup check list: where to set capture up, and,
// on a live project with someone signed in, whether fetch-media answers.
export default function CaptureSetupRow() {
  const { user } = useAuth();
  const check = DB_MODE === 'live' && !!user;
  const [media, setMedia] = useState(check ? 'checking' : null); // checking | ok | missing

  useEffect(() => {
    if (!check) return undefined;
    let live = true;
    setMedia('checking');
    Promise.resolve()
      .then(() => db.functions.invoke('fetch-media', { body: { action: 'status' } }))
      .then(({ data, error }) => live && setMedia(!error && data?.ok ? 'ok' : 'missing'))
      .catch(() => live && setMedia('missing'));
    return () => {
      live = false;
    };
  }, [check]);

  return (
    <>
      <Row level="info" title="Capture: bookmarklet and extension" detail="Save ads from the Meta Ad Library in one click.">
        <Link
          to="/capture/setup"
          className="press mt-3 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[14px] font-semibold text-ink transition-colors"
        >
          Set up capture
        </Link>
      </Row>
      {media === 'checking' && <Row level="info" title="Checking fetch-media..." />}
      {media === 'ok' && <Row level="ok" title="Creatives are copied into your storage" />}
      {media === 'missing' && (
        <Row
          level="info"
          title="Optional: deploy fetch-media so captured creatives are copied into your storage"
          fix="supabase functions deploy fetch-media"
        />
      )}
    </>
  );
}
