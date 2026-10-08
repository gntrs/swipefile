import React from 'react';
import { DB_MODE } from '@/lib/db';
import Wordmark from '@/components/Wordmark';
import { useSetup } from '@/lib/setup/SetupContext';
import AiSetupRow from '@/features/ai/AiSetupRow';
import CaptureSetupRow, { SetupRow } from '@/features/capture/CaptureSetupRow';
import { Button } from '@/components/ui';

const MODE_TEXT = {
  demo: 'No database is connected, so the app runs in demo mode on sample ads.',
  misconfigured: 'The database settings in .env are incomplete or wrong. The app stays on this page until they are fixed.',
  live: 'Connected to your Supabase project. Here is what the check found.',
};

export default function Setup() {
  const { status, checks, loading, rerun } = useSetup();
  const blocking = status === 'blocking';

  return (
    <div data-page="setup" className="h-full overflow-y-auto overscroll-contain bg-canvas text-ink">
      <div className="mx-auto w-full max-w-[720px] px-[var(--gutter)] pt-[calc(1.5rem+env(safe-area-inset-top))] lg:pt-10 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <p className="mb-8 min-h-[44px] flex items-center">
          <Wordmark />
        </p>

        <header className="mb-6 lg:mb-8">
          <p className="label-mono mb-2">Setup check</p>
          <h1 className="text-h1 text-ink text-balance">
            {blocking ? 'Fix this before the app can start' : status === 'warn' ? 'Almost there' : 'Everything needed is in place'}
          </h1>
          <p className="text-body text-ink-soft mt-2 max-w-[60ch]">{MODE_TEXT[DB_MODE] || MODE_TEXT.live}</p>
        </header>

        <section aria-label="Checks" className="bg-card rounded-xl3">
          {loading && checks.length === 0 ? (
            <p className="px-5 lg:px-6 py-5 text-body text-ink-soft">Checking your project...</p>
          ) : (
            <ul className="divide-y divide-line">
              {checks.map((c, i) => (
                <SetupRow
                  key={`${c.id}-${i}`}
                  level={c.level}
                  title={c.title}
                  detail={c.detail}
                  fix={c.fix}
                  copyLabel="Copy the fix"
                  data-check={c.id}
                />
              ))}
              {/* Optional features report their own rows after the core checks,
                  once nothing blocks. Before that they cannot be used: with a
                  half filled .env the AI row would claim demo mode and Set up
                  capture would only lead back to this page. */}
              {!blocking && (
                <>
                  <AiSetupRow />
                  <CaptureSetupRow />
                </>
              )}
            </ul>
          )}
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {DB_MODE === 'live' && (
            <Button variant="primary" onClick={rerun} disabled={loading}>
              {loading ? 'Checking...' : 'Run again'}
            </Button>
          )}
          {!blocking && <Button to="/">Back to the app</Button>}
        </div>
        {blocking && (
          <p className="mt-4 text-small text-ink-soft">
            After changing .env, stop npm run dev and start it again, then reload this page.
          </p>
        )}
      </div>
    </div>
  );
}
