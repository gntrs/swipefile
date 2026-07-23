import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, PaperPlaneRight, Smiley, Sparkle, User } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { useMediaUrl } from '@/lib/media';
import { isMissingColumn, isMissingTable } from '@/lib/db';
import MigrationCard from '@/components/MigrationCard';

const MAX_MESSAGES = 80; // plenty for a quick team ping board
const POLL_MS = 15000; // fallback when realtime is off
const EMOJIS = ['👍', '❤️', '😂', '🔥', '✅', '👀'];
const MENTION_RE = /@([a-z0-9]+)/gi;

function timeLabel(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Split a message body into plain text and @mention chunks, matching against
// the known slugs so a stray "@" that doesn't tag anyone stays plain text.
function renderBody(body, bySlug, myEmail) {
  const parts = [];
  let last = 0;
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(body))) {
    const person = bySlug.get(m[1].toLowerCase());
    if (!person) continue;
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(
      <span
        key={m.index}
        className={`font-semibold rounded px-1 py-0.5 ${
          person.email === myEmail ? 'bg-coral text-black' : 'bg-coral-soft text-coral-dark'
        }`}
      >
        @{person.label}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

function Message({ msg, reactions, myEmail, mentionsMe, bySlug, pickerOpen, onTogglePicker, onReact }) {
  const { displayName, avatarFor } = useTeam();
  const avatar = useMediaUrl(avatarFor(msg.author_email));
  const isClaude = msg.author_email === 'claude@analysis';

  // Group this message's reactions per emoji, remember if one of them is mine.
  const pills = useMemo(() => {
    const m = new Map();
    for (const r of reactions) {
      const p = m.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
      p.count++;
      if (r.author_email === myEmail) p.mine = true;
      m.set(r.emoji, p);
    }
    return [...m.values()];
  }, [reactions, myEmail]);

  return (
    <div className={`flex items-start gap-2.5 py-1.5 px-1.5 -mx-1.5 rounded-xl ${mentionsMe ? 'bg-coral-soft/50' : ''}`}>
      <span
        className={`w-7 h-7 rounded-full border flex items-center justify-center overflow-hidden flex-shrink-0 mt-0.5 ${
          isClaude ? 'bg-coral border-coral text-black' : 'bg-cream border-line'
        }`}
      >
        {isClaude ? (
          <img src="/claude-avatar.svg" alt="" className="w-full h-full object-cover" />
        ) : avatar ? (
          <img src={avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          <User size={14} className="text-ink-soft" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-ink-soft leading-tight">
          <span className="font-semibold text-ink">{displayName(msg.author_email)}</span>
          {' · '}
          {timeLabel(msg.created_at)}
        </p>
        <p className="text-[14px] leading-snug break-words whitespace-pre-wrap">
          {renderBody(msg.body, bySlug, myEmail)}
        </p>

        {(pills.length > 0 || pickerOpen) && (
          <div className="flex items-center flex-wrap gap-1 mt-1">
            {pills.map((p) => (
              <button
                key={p.emoji}
                type="button"
                onClick={() => onReact(msg, p.emoji)}
                aria-label={`${p.emoji} ${p.count}, tap to toggle`}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[12px] border transition-colors ${
                  p.mine ? 'bg-coral-soft border-coral text-coral-dark' : 'bg-cream border-line text-ink-soft'
                }`}
              >
                {p.emoji} <span className="tabular-nums font-semibold">{p.count}</span>
              </button>
            ))}
            {pickerOpen &&
              EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onReact(msg, e)}
                  aria-label={`React ${e}`}
                  className="px-1.5 py-0.5 rounded-full text-[15px] hover:bg-cream active:scale-110 transition-transform"
                >
                  {e}
                </button>
              ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onTogglePicker(msg.id)}
        aria-label="React to message"
        className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
          pickerOpen ? 'bg-coral-soft text-coral-dark' : 'text-ink-soft/50 hover:bg-cream'
        }`}
      >
        <Smiley size={15} weight="bold" />
      </button>
    </div>
  );
}

// Quick team chat on the dashboard. Live via database realtime; if realtime is
// off (or the channel errors), a slow poll keeps messages flowing anyway.
// Reactions: tap the smiley on a message, pick an emoji; tap a pill to toggle
// yours off. @mention: type @ to open the picker (team + Claude); mentioning
// someone highlights the message for them and (if the tab is backgrounded) a
// browser notification, best-effort. Claude posts, reacts, and reads mentions
// through scripts/chat.mjs.
export default function TeamChat() {
  const { user } = useAuth();
  const { mentionables } = useTeam();
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [text, setText] = useState('');
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null); // {start, end, query} or null
  const [mentionIndex, setMentionIndex] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);
  const autoScrolling = useRef(false);
  const autoScrollTimer = useRef(null);
  const notifiedIds = useRef(new Set());

  const bySlug = useMemo(() => new Map(mentionables.map((m) => [m.slug, m])), [mentionables]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.query.toLowerCase();
    return mentionables.filter((m) => m.slug.startsWith(q) || m.label.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mentionQuery, mentionables]);

  const append = useCallback((m) => {
    setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m].slice(-MAX_MESSAGES)));
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await db
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_MESSAGES);
    if (error) {
      if (isMissingTable(error)) setMissing(true);
      setLoading(false);
      return;
    }
    const msgs = (data || []).reverse();
    setMessages(msgs);
    setLoading(false);
    if (msgs.length) {
      // Reactions table may not exist yet (migration 10) - chat still works.
      const { data: r } = await db
        .from('chat_reactions')
        .select('*')
        .in('message_id', msgs.map((m) => m.id));
      if (r) setReactions(r);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates for messages AND reactions. subscribe() reports status;
  // anything but SUBSCRIBED means realtime is unavailable and the polling
  // effect below takes over.
  useEffect(() => {
    if (missing) return undefined;
    const channel = db
      .channel('team-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => payload.new && append(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_reactions' },
        (payload) =>
          payload.new &&
          setReactions((cur) => (cur.some((x) => x.id === payload.new.id) ? cur : [...cur, payload.new]))
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_reactions' },
        (payload) => payload.old?.id && setReactions((cur) => cur.filter((x) => x.id !== payload.old.id))
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      db.removeChannel(channel);
    };
  }, [missing, append]);

  // Fallback: gentle poll while the realtime channel is not connected.
  useEffect(() => {
    if (missing || live) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [missing, live, load]);

  // Scroll behavior: only auto-follow new messages while already at the
  // bottom, so reading up through history never gets yanked back down. While
  // scrolled up, new arrivals just bump a "N new" pill instead.
  //
  // The smooth scrollTo below fires its own scroll events while it animates,
  // and mid-animation the list isn't at the bottom yet - onScroll would read
  // that as "the user scrolled away" and permanently cancel auto-follow after
  // the very first message. autoScrolling flags that window so onScroll
  // ignores it until the animation has had time to finish.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottom.current) {
      autoScrolling.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      clearTimeout(autoScrollTimer.current);
      autoScrollTimer.current = setTimeout(() => {
        autoScrolling.current = false;
      }, 500);
      setNewCount(0);
    } else if (messages.length) {
      setNewCount((c) => c + 1);
    }
  }, [messages]);

  // Best-effort desktop ping when a new message mentions me and this tab is
  // backgrounded. No service worker (by design, see CLAUDE.md) so this only
  // fires while the tab is open; permission is requested lazily on first hit.
  useEffect(() => {
    if (!user?.email || typeof Notification === 'undefined') return;
    const latest = messages[messages.length - 1];
    if (!latest || notifiedIds.current.has(latest.id)) return;
    if (!(latest.mentions || []).includes(user.email)) return;
    if (document.visibilityState === 'visible') return;
    notifiedIds.current.add(latest.id);
    const ping = () => new Notification('Mentioned in dashboard chat', { body: latest.body.slice(0, 120) });
    if (Notification.permission === 'granted') ping();
    else if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => p === 'granted' && ping());
    }
  }, [messages, user?.email]);

  const onScroll = () => {
    if (autoScrolling.current) return; // our own smooth-scroll is still animating, not a user action
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    stickToBottom.current = atBottom;
    if (atBottom) setNewCount(0);
  };

  const jumpToLatest = () => {
    stickToBottom.current = true;
    autoScrolling.current = true;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    clearTimeout(autoScrollTimer.current);
    autoScrollTimer.current = setTimeout(() => {
      autoScrolling.current = false;
    }, 500);
    setNewCount(0);
  };

  // Track the @token under the caret as the user types, so the dropdown only
  // shows while mid-mention (an unterminated "@word" right before the cursor).
  const onTextChange = (e) => {
    const value = e.target.value;
    setText(value);
    const caret = e.target.selectionStart ?? value.length;
    const upToCaret = value.slice(0, caret);
    const m = upToCaret.match(/(?:^|\s)@([a-z0-9]*)$/i);
    if (m) {
      const start = caret - m[1].length - 1;
      setMentionQuery({ start, end: caret, query: m[1] });
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const pickMention = (person) => {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(mentionQuery.end);
    const insert = `@${person.slug} `;
    const next = `${before}${insert}${after}`;
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = before.length + insert.length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const onInputKeyDown = (e) => {
    if (!mentionQuery || mentionMatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % mentionMatches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pickMention(mentionMatches[mentionIndex]);
    } else if (e.key === 'Escape') {
      setMentionQuery(null);
    }
  };

  // Resolve every @slug in the body to an email, for storage + the "you were
  // mentioned" highlight/notification. Unknown slugs (no match) stay as plain
  // text, so typing "@" without picking someone never tags anyone by mistake.
  const resolveMentions = (body) => {
    const emails = new Set();
    let m;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(body))) {
      const person = bySlug.get(m[1].toLowerCase());
      if (person) emails.add(person.email);
    }
    return [...emails];
  };

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !user) return;
    setText('');
    setMentionQuery(null);
    let { data, error } = await db
      .from('chat_messages')
      .insert({ body, author_id: user.id, author_email: user.email, mentions: resolveMentions(body) })
      .select()
      .single();
    if (error && isMissingColumn(error)) {
      // db-setup.sql not run yet - send without @mention data
      // rather than blocking the whole chat on it.
      ({ data, error } = await db
        .from('chat_messages')
        .insert({ body, author_id: user.id, author_email: user.email })
        .select()
        .single());
    }
    if (error) {
      if (isMissingTable(error)) setMissing(true);
      else setText(body); // give the message back instead of losing it
      return;
    }
    if (data) append(data); // realtime may deliver it too; append dedupes by id
  };

  // Toggle my reaction: tap adds, tapping the same emoji again removes.
  const react = async (msg, emoji) => {
    if (!user) return;
    setPickerFor(null);
    const mine = reactions.find(
      (r) => r.message_id === msg.id && r.emoji === emoji && r.author_email === user.email
    );
    if (mine) {
      setReactions((cur) => cur.filter((r) => r.id !== mine.id));
      const { error } = await db.from('chat_reactions').delete().eq('id', mine.id);
      if (error) setReactions((cur) => [...cur, mine]); // put it back
    } else {
      const { data, error } = await db
        .from('chat_reactions')
        .insert({ message_id: msg.id, emoji, author_email: user.email })
        .select()
        .single();
      if (data) setReactions((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, data]));
      if (error && !/duplicate/i.test(error.message)) load(); // resync on anything odd
    }
  };

  if (missing) return <MigrationCard title="Team chat" />;

  return (
    <div className="bg-card rounded-xl3 border border-line shadow-card p-5 flex flex-col">
      <h2 className="font-semibold text-[15px] mb-2">Team chat</h2>

      <div className="relative flex-1">
        <div ref={listRef} onScroll={onScroll} className="h-[380px] overflow-y-auto -mx-1 px-1">
          {loading ? (
            <p className="text-ink-soft text-[13px] py-2">Loading...</p>
          ) : messages.length === 0 ? (
            <p className="text-ink-soft text-[13px] py-2">
              Quiet in here. Say hi, drop a link, @mention the team.
            </p>
          ) : (
            messages.map((m) => (
              <Message
                key={m.id}
                msg={m}
                reactions={reactions.filter((r) => r.message_id === m.id)}
                myEmail={user?.email}
                mentionsMe={(m.mentions || []).includes(user?.email)}
                bySlug={bySlug}
                pickerOpen={pickerFor === m.id}
                onTogglePicker={(id) => setPickerFor((cur) => (cur === id ? null : id))}
                onReact={react}
              />
            ))
          )}
        </div>

        {newCount > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="press absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 rounded-full bg-ink text-black text-[12px] font-semibold shadow-cta"
          >
            {newCount} new <ArrowDown size={13} weight="bold" />
          </button>
        )}
      </div>

      <form onSubmit={send} className="relative flex items-center gap-2 mt-3">
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-56 bg-card border border-line rounded-xl2 shadow-card overflow-hidden">
            {mentionMatches.map((person, i) => (
              <button
                key={person.email}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMention(person)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left ${
                  i === mentionIndex ? 'bg-coral-soft' : 'hover:bg-cream'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    person.email === 'claude@analysis' ? 'bg-coral text-black' : 'bg-cream border border-line'
                  }`}
                >
                  {person.email === 'claude@analysis' ? <Sparkle size={11} weight="fill" /> : null}
                </span>
                <span className="font-medium text-ink">{person.label}</span>
                <span className="text-ink-soft">@{person.slug}</span>
              </button>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          value={text}
          onChange={onTextChange}
          onKeyDown={onInputKeyDown}
          placeholder="Message the team, @mention someone"
          maxLength={500}
          className="flex-1 min-w-0 py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[16px] sm:text-[14px]"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Send"
          className="press w-10 h-10 rounded-2xl bg-coral text-black flex items-center justify-center flex-shrink-0 shadow-cta disabled:opacity-40 disabled:shadow-none"
        >
          <PaperPlaneRight size={17} weight="bold" />
        </button>
      </form>
    </div>
  );
}
