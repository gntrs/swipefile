import React, { useEffect, useState } from 'react';
import { CheckCircle, Info, Warning, XCircle } from '@phosphor-icons/react';
import { db, DB_MODE } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { Badge, Button } from '@/components/ui';
import CopyButton from './CopyButton';

// The look of each level on the setup check: the status icon colour and the
// badge that names it. Colour always rides with a word.
export const SETUP_LEVELS = {
  ok: { icon: CheckCircle, label: 'OK', tone: 'good', iconCls: 'text-emerald-400' },
  info: { icon: Info, label: 'Info', tone: 'neutral', iconCls: 'text-ink-soft' },
  warn: { icon: Warning, label: 'Warning', tone: 'warn', iconCls: 'text-amber-400' },
  fail: { icon: XCircle, label: 'Blocking', tone: 'bad', iconCls: 'text-red-400' },
};

// One row of the setup check list, in a flush panel split by hairlines: status icon, title,
// level badge, the explanation, then the command in a code box with Copy
// beside it (under it on a phone), then any action buttons as children.
// `copyLabel` is the Copy button's accessible name. `...rest` lands on the li
// (data-check).
export function SetupRow({ level = 'info', title, detail, fix, copyLabel = 'Copy the command', children, ...rest }) {
  const { icon: Icon, label, tone, iconCls } = SETUP_LEVELS[level] || SETUP_LEVELS.info;
  return (
    <li className="px-5 lg:px-6 py-5" {...rest}>
      <div className="flex items-start gap-3">
        <Icon size={20} weight="bold" className={`${iconCls} flex-shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-title text-ink min-w-0">{title}</p>
            <Badge tone={tone}>{label}</Badge>
          </div>
          {detail && <p className="text-body text-ink-soft mt-2 max-w-[68ch]">{detail}</p>}
          {fix && (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-start gap-2">
              <code className="flex-1 min-w-0 block bg-canvas rounded-xl p-3 font-mono text-small text-ink whitespace-pre-wrap break-words">
                {fix}
              </code>
              <CopyButton text={fix} ariaLabel={copyLabel} className="self-start" />
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
      <SetupRow level="info" title="Capture: bookmarklet and extension" detail="Save ads from the Meta Ad Library in one click." data-check="capture">
        <Button to="/capture/setup" className="mt-3">
          Set up capture
        </Button>
      </SetupRow>
      {media === 'checking' && <SetupRow level="info" title="Checking fetch-media..." data-check="fetch-media" />}
      {media === 'ok' && <SetupRow level="ok" title="Creatives are copied into your storage" data-check="fetch-media" />}
      {media === 'missing' && (
        <SetupRow
          level="info"
          title="Optional: deploy fetch-media so captured creatives are copied into your storage"
          fix="supabase functions deploy fetch-media"
          data-check="fetch-media"
        />
      )}
    </>
  );
}
