import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookmarkSimple } from '@phosphor-icons/react';
import { buildBookmarklet } from './bookmarklet';
import { capturePath } from './params';
import { SAMPLE_CAPTURE } from './capture';
import CopyButton from './CopyButton';

export const TERMS_NOTE =
  "Meta's terms do not allow automated collection from its sites. Capture only reads the ad you click, in your own browser, and sends it only to your swipefile. It never crawls and never sees your Facebook login.";

const kicker = 'kicker';
const body = 'text-[16px] leading-relaxed text-ink-soft';
const codeBox =
  'block w-full bg-card border border-line rounded-lg px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink break-all focus:outline-none';

function Section({ n, title, children }) {
  return (
    <section className="py-8 border-t border-line first:border-t-0 first:pt-0">
      <p className={kicker}>Step {n}</p>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] leading-tight mt-2 mb-3">{title}</h2>
      {children}
    </section>
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
    <div data-page="capture-setup" className="px-5 sm:px-8 pt-6 sm:pt-8 pb-10 max-w-[720px] mx-auto">
      <p className={kicker}>Capture</p>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-[1.1] mt-3">Save ads from the Meta Ad Library</h1>
      <p className={`${body} mt-3`}>
        One click on an ad in the Ad Library opens your swipefile with the ad filled in. You check it, then save. Use the
        bookmarklet, the extension, or both.
      </p>

      <div className="mt-8">
        <Section n={1} title="The bookmarklet">
          <p className={body}>
            Drag this to your bookmarks bar. On the Meta Ad Library, click it, then click the ad you want.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              ref={linkRef}
              draggable="true"
              onClick={(e) => {
                e.preventDefault();
                setClicked(true);
              }}
              className="press inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-accent text-black text-[15px] font-semibold hover:bg-accent-dim transition-colors cursor-grab active:cursor-grabbing"
            >
              <BookmarkSimple size={18} weight="bold" aria-hidden="true" />
              Save to swipefile
            </a>
            <CopyButton text={code} label="Copy code" ariaLabel="Copy the bookmarklet code" onFail={() => setShowCode(true)} />
          </div>
          {clicked && (
            <p role="status" className="mt-3 text-[15px] text-ink">
              Drag it to your bookmarks bar instead of clicking it here. It works on the Ad Library, not on this page.
            </p>
          )}
          <p className={`${body} mt-4`}>
            No bookmarks bar, or on a phone? Make any bookmark, edit it, and paste the code as its address.
          </p>
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

        <Section n={2} title="The extension (Chrome, Edge, Brave)">
          <ol className="list-decimal pl-5 space-y-2 text-[16px] leading-relaxed text-ink-soft marker:font-mono marker:text-[13px]">
            <li>
              In your copy of the swipefile repo, find the <code className="font-mono text-[14px] text-ink">extension</code> folder.
            </li>
            <li>
              Open <code className="font-mono text-[14px] text-ink">chrome://extensions</code> (Edge:{' '}
              <code className="font-mono text-[14px] text-ink">edge://extensions</code>, Brave:{' '}
              <code className="font-mono text-[14px] text-ink">brave://extensions</code>) and turn on Developer mode.
            </li>
            <li>Press Load unpacked and pick the extension folder.</li>
            <li>Open the extension's options and paste this address:</li>
          </ol>
          <div className="mt-3 flex items-start gap-2">
            <code className={`${codeBox} flex-1 min-w-0`}>{origin}</code>
            <CopyButton text={origin} ariaLabel="Copy this address" />
          </div>
          <p className={`${body} mt-4`}>
            On the Ad Library every ad then has a Save to swipefile button, including ads that load as you scroll.
          </p>
        </Section>

        <Section n={3} title="Copying the creative">
          <p className={body}>
            Meta's image and video links expire. To keep the creative, deploy the fetch-media function to your Supabase
            project: capture then copies it into your own storage when you save. Without it the ad still saves, and you
            can add the file on the ad page.
          </p>
          <div className="mt-3 flex items-start gap-2">
            <code className={`${codeBox} flex-1 min-w-0`}>supabase functions deploy fetch-media</code>
            <CopyButton text="supabase functions deploy fetch-media" ariaLabel="Copy the deploy command" />
          </div>
        </Section>

        <Section n={4} title="Try it">
          <p className={body}>Open the capture page with a sample ad to see what a capture looks like before you save.</p>
          <Link
            to={sample}
            className="press mt-4 inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[15px] font-semibold text-ink transition-colors"
          >
            Try it with a sample
          </Link>
        </Section>
      </div>

      <p className="mt-2 pt-6 border-t border-line text-[15px] leading-relaxed text-ink-soft">{TERMS_NOTE}</p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        Details, privacy and what to do when Meta changes the page: docs/CAPTURE.md in the repo.
      </p>
    </div>
  );
}
