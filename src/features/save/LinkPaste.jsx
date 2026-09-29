import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { LinkSimple } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { parseAdLibraryInput, isAdLibraryUrl } from '@/lib/adlibrary';
import { isOn, FEATURE_READY } from '@/lib/modules';

// What the link field holds, as the Add page needs it:
//   { input, kind: 'empty' | 'ok' | 'search' | 'junk', parsed, duplicate, checking, error }
export const EMPTY_LINK = { input: '', kind: 'empty', parsed: null, duplicate: null, checking: false, error: '' };

export function classifyLink(input) {
  const text = String(input || '').trim();
  if (!text) return { kind: 'empty', parsed: null };
  const parsed = parseAdLibraryInput(text);
  if (parsed) return { kind: 'ok', parsed };
  if (isAdLibraryUrl(text)) return { kind: 'search', parsed: null };
  return { kind: 'junk', parsed: null };
}

// The metrics a valid link adds to the saved ad. The permalink is rebuilt
// from the id, so nothing else from the pasted link (tokens, tracking) is kept.
export const linkMetrics = (link) =>
  link?.kind === 'ok'
    ? { ad_library_id: link.parsed.libraryId, ad_permalink: link.parsed.permalink, source_url: link.parsed.permalink }
    : {};

// The field at the top of the Add page. Reads an Ad Library link or id on
// paste or blur, says what it found, and looks for the same ad already saved.
// It never fetches anything from Meta: a browser app cannot hold a Meta token.
export default function LinkPaste({ value, onChange, client = db }) {
  const check = useRef(0);

  const run = async (input) => {
    const { kind, parsed } = classifyLink(input);
    const id = ++check.current;
    // A pasted link is shown as its clean permalink, so a token in it is gone
    // from the field too.
    const shown = parsed?.kind === 'url' ? parsed.permalink : input;
    const base = { ...EMPTY_LINK, input: shown, kind, parsed };
    if (kind !== 'ok') {
      onChange(base);
      return;
    }
    onChange({ ...base, checking: true });
    let result;
    try {
      result = await client.from('ads').select('id, brand, hook').eq('metrics->>ad_library_id', parsed.libraryId).limit(1);
    } catch (err) {
      result = { data: null, error: { message: err?.message || String(err) } };
    }
    if (id !== check.current) return;
    onChange({
      ...base,
      duplicate: result?.data?.[0] || null,
      error: result?.error ? `Could not check for a saved copy: ${result.error.message}` : '',
    });
  };

  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    e.preventDefault();
    run(text.trim());
  };

  return (
    <div>
      <label htmlFor="ad-link" className="text-[13px] font-semibold text-ink-soft mb-1 block">
        Paste an Ad Library link or ad id
      </label>
      <div className="flex items-center gap-2 min-h-[44px] bg-canvas border border-line rounded-2xl px-3 focus-within:border-accent">
        <LinkSimple size={18} weight="bold" className="text-ink-soft flex-shrink-0" />
        <input
          id="ad-link"
          value={value.input}
          onChange={(e) => onChange({ ...EMPTY_LINK, input: e.target.value })}
          onPaste={onPaste}
          onBlur={(e) => run(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              run(e.currentTarget.value.trim());
            }
          }}
          inputMode="url"
          autoComplete="off"
          placeholder="https://www.facebook.com/ads/library/?id=..."
          className="w-full min-w-0 min-h-[44px] py-2.5 bg-transparent focus:outline-none text-[16px] sm:text-[14px]"
        />
      </div>
      <LinkMessage link={value} />
    </div>
  );
}

function LinkMessage({ link }) {
  if (link.kind === 'search') {
    return (
      <p role="status" className="mt-2 text-[15px] text-amber-400 leading-relaxed">
        That link is a search, not one ad. Open the ad (See ad details), then copy the link from the address bar.
      </p>
    );
  }
  if (link.kind === 'junk') {
    return (
      <p role="status" className="mt-2 text-[15px] text-ink-soft leading-relaxed">
        Not an Ad Library link. You can still paste it as the source link below.
      </p>
    );
  }
  if (link.kind !== 'ok') return null;
  return (
    <div role="status" className="mt-2 grid gap-2 text-[15px] leading-relaxed">
      <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-soft">
        Ad id <span className="text-ink tabular-nums normal-case tracking-normal">{link.parsed.libraryId}</span>
        {link.checking && <span className="ml-2 normal-case tracking-normal">Checking...</span>}
      </p>
      {link.duplicate && (
        <p className="text-ink">
          Already in your swipe file: <strong className="font-semibold">{link.duplicate.brand || 'Untitled'}</strong>
          {link.duplicate.hook ? `, ${link.duplicate.hook}` : ''}.{' '}
          <Link to={`/ad/${link.duplicate.id}`} className="underline underline-offset-2 text-accent-dim">
            Open
          </Link>
        </p>
      )}
      {link.error && <p className="text-amber-400">{link.error}</p>}
      <p className="text-ink-soft">
        Saved with its link. Meta does not let apps download the ad itself, and its API only covers ads shown in the EU and
        UK. Add the image or video below.
        {isOn('competitors') && ' Track the brand and the Ad Library importer fills in dates and reach for EU and UK ads on its next run.'}
      </p>
      {FEATURE_READY.capture && (
        <p>
          <Link to="/capture/setup" className="underline underline-offset-2 text-accent-dim">
            Or capture it straight from the Ad Library
          </Link>
        </p>
      )}
    </div>
  );
}
