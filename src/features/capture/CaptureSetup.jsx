import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkSimple } from '@phosphor-icons/react';
import { buildBookmarklet } from './bookmarklet';
import { capturePath } from './params';
import { SAMPLE_CAPTURE } from './capture';
import CopyButton from './CopyButton';
import { Page, PageHeader, Section, Button } from '@/components/ui';

export const TERMS_NOTE =
  "Meta's terms do not allow automated collection from its sites. Capture only reads the ad you click, in your own browser, and sends it only to your swipefile. It never crawls and never sees your Facebook login.";

const body = 'text-body text-ink-soft max-w-[68ch]';
const codeBox =
  'block w-full bg-card rounded-xl p-3 font-mono text-small text-ink break-all focus:outline-none';
const inlineCode = 'font-mono text-small text-ink';

// A command or an address with its Copy button beside it (under it on a phone).
function CodeRow({ children, copy }) {
  return (
    <div className="mt-3 flex flex-col sm:flex-row sm:items-start gap-2">
      <code className={`${codeBox} flex-1 min-w-0`}>{children}</code>
      {copy}
    </div>
  );
}

// How to install the bookmarklet and the extension, the terms note, and a
// sample capture to try the capture page with.
export default function CaptureSetup() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const code = useMemo(() => buildBookmarklet(origin), [origin]);
  const linkRef = useRef(null);
  const [showCode, setShowCode] = useState(false);
  const [clicked, setClicked] = useState(false);

  // React warns about javascript: URLs in JSX, so the href goes on after mount.
  useEffect(() => {
    linkRef.current?.setAttribute('href', code);
  }, [code]);

  const sample = capturePath(SAMPLE_CAPTURE, 'bookmarklet');

  return (
    <Page id="capture-setup" width="narrow">
      <PageHeader
        eyebrow="Capture"
        title="Save ads from the Meta Ad Library"
        context="One click on an ad in the Ad Library opens your swipefile with the ad filled in. Use the bookmarklet, the extension, or both."
      />

      <Section first label="Step 1" title="The bookmarklet">
        <p className={body}>Drag this to your bookmarks bar. On the Meta Ad Library, click it, then click the ad you want.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            ref={linkRef}
            draggable="true"
            onClick={(e) => {
              e.preventDefault();
              setClicked(true);
            }}
            className="press inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-accent text-black text-ui font-semibold hover:bg-accent-dim transition-colors cursor-grab active:cursor-grabbing"
          >
            <BookmarkSimple size={16} weight="bold" aria-hidden="true" />
            Save to swipefile
          </a>
          <CopyButton text={code} label="Copy code" ariaLabel="Copy the bookmarklet code" onFail={() => setShowCode(true)} />
        </div>
        {clicked && (
          <p role="status" className="mt-3 text-ui text-ink">
            Drag it to your bookmarks bar instead of clicking it here. It works on the Ad Library, not on this page.
          </p>
        )}
        <p className={`${body} mt-4`}>No bookmarks bar, or on a phone? Make any bookmark, edit it, and paste the code as its address.</p>
        {showCode && (
          <textarea
            readOnly
            value={code}
            onFocus={(e) => e.target.select()}
            aria-label="Bookmarklet code"
            className={`${codeBox} mt-3 min-h-[120px]`}
          />
        )}
      </Section>

      <Section label="Step 2" title="The extension (Chrome, Edge, Brave)">
        <ol className="list-decimal pl-5 space-y-2 text-body text-ink-soft max-w-[68ch] marker:text-ink-soft">
          <li>
            In your copy of the swipefile repo, find the <code className={inlineCode}>extension</code> folder.
          </li>
          <li>
            Open <code className={inlineCode}>chrome://extensions</code> (Edge: <code className={inlineCode}>edge://extensions</code>, Brave:{' '}
            <code className={inlineCode}>brave://extensions</code>) and turn on Developer mode.
          </li>
          <li>Press Load unpacked and pick the extension folder.</li>
          <li>Open the extension's options and paste this address:</li>
        </ol>
        <CodeRow copy={<CopyButton text={origin} ariaLabel="Copy this address" className="self-start" />}>{origin}</CodeRow>
        <p className={`${body} mt-4`}>
          On the Ad Library every ad then has a Save to swipefile button, including ads that load as you scroll.
        </p>
      </Section>

      <Section label="Step 3" title="Copying the creative">
        <p className={body}>
          Meta's image and video links expire. To keep the creative, deploy the <span className="whitespace-nowrap">fetch-media</span> function to your Supabase
          project: capture then copies it into your own storage when you save. Without it the ad still saves, and you
          can add the file on the ad page.
        </p>
        <CodeRow
          copy={<CopyButton text="supabase functions deploy fetch-media" ariaLabel="Copy the deploy command" className="self-start" />}
        >
          supabase functions deploy fetch-media
        </CodeRow>
      </Section>

      <Section label="Step 4" title="Try it">
        <p className={body}>Open the capture page with a sample ad to see what a capture looks like before you save.</p>
        <Button to={sample} className="mt-4">
          Try it with a sample
        </Button>
      </Section>

      <div className="mt-10 lg:mt-12 pt-6 border-t border-line space-y-3 max-w-[68ch]">
        <p className="text-small text-ink-soft">{TERMS_NOTE}</p>
        <p className="text-small text-ink-soft">
          Details, privacy and what to do when Meta changes the page: <code className={inlineCode}>docs/CAPTURE.md</code> in the
          repo.
        </p>
      </div>
    </Page>
  );
}
