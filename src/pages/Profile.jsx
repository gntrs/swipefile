import React, { useRef, useState } from 'react';
import { Camera, User, Confetti } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { useMediaUrl } from '@/lib/media';
import { triggerCelebration, celebrationEnabled, setCelebrationEnabled } from '@/lib/celebration';

function TeamMember({ member, isMe }) {
  const avatar = useMediaUrl(member.avatar_path);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={`w-10 h-10 rounded-full bg-cream border flex items-center justify-center overflow-hidden flex-shrink-0 ${
          isMe ? 'border-coral ring-2 ring-coral/30' : 'border-line'
        }`}
      >
        {avatar ? (
          <img src={avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          <User size={17} className="text-ink-soft" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14px] truncate">
          {member.nickname?.trim() || member.email?.split('@')[0]}
          {isMe && <span className="text-ink-soft font-normal"> (you)</span>}
        </p>
        <p className="text-[12px] text-ink-soft truncate">{member.email}</p>
      </div>
      {member.role === 'admin' && (
        <span className="text-[11px] font-semibold uppercase tracking-wide bg-mint/40 text-ink-soft px-2 py-0.5 rounded-full flex-shrink-0">
          admin
        </span>
      )}
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const { me, members, avatarFor, refresh } = useTeam();
  const fileRef = useRef(null);
  const [nickname, setNickname] = useState(me?.nickname || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [partyOn, setPartyOn] = useState(celebrationEnabled());

  const avatar = useMediaUrl(user ? avatarFor(user.email) : null);

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const ext = file.name.split('.').pop();
      // Unique name each upload (no storage UPDATE policy needed).
      const path = `avatars/${user.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await db.storage.from('ad-media').upload(path, file);
      if (upErr) throw upErr;
      const { error } = await db.from('team').update({ avatar_path: path }).eq('id', user.id);
      if (error) throw error;
      await refresh();
      setMsg('Photo updated.');
    } catch (err) {
      setMsg(err.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const { error } = await db
        .from('team')
        .update({ nickname: nickname.trim() || null })
        .eq('id', user.id);
      if (error) throw error;
      await refresh();
      setMsg('Saved.');
    } catch (err) {
      setMsg(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[480px] mx-auto">
      <h1 className="text-[22px] font-semibold tracking-tight mb-5">Your profile</h1>

      <div className="bg-card rounded-xl3 border border-line shadow-card p-6">
        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="relative w-20 h-20 rounded-full bg-cream border border-line flex items-center justify-center overflow-hidden group"
            title="Change photo"
          >
            {avatar ? (
              <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <User size={30} className="text-ink-soft" />
            )}
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={20} color="#fff" weight="bold" />
            </span>
          </button>
          <div>
            <p className="font-semibold text-[15px] flex items-center gap-2">
              {me?.nickname || user?.email?.split('@')[0]}
              {me?.role && (
                <span className="text-[11px] font-semibold uppercase tracking-wide bg-mint/40 text-ink-soft px-2 py-0.5 rounded-full">
                  {me.role}
                </span>
              )}
            </p>
            <p className="text-ink-soft text-[13px]">{user?.email}</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-coral-dark text-[13px] font-medium mt-1"
            >
              Change photo
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
        </div>

        {/* Nickname */}
        <form onSubmit={save}>
          <label className="text-[13px] font-semibold text-ink-soft mb-1 block">Nickname</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="How the team sees you"
            maxLength={30}
            className="w-full py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[14px]"
          />
          <p className="text-[12px] text-ink-soft mt-1.5">
            Shown on everything you add and every note you leave.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="press mt-4 px-6 py-2.5 rounded-2xl bg-coral text-black font-semibold shadow-cta disabled:opacity-60"
          >
            {busy ? 'Saving...' : 'Save'}
          </button>
          {msg && <p className="text-[13px] text-ink-soft mt-3">{msg}</p>}
        </form>
      </div>

      {/* Party mode: fullscreen celebration clip when a sale lands. Shows on
          phones too - Test taps count as user gestures, so playback works.
          Clips are user-supplied: see public/memes/README.md. */}
      <div className="bg-card rounded-xl3 border border-line shadow-card p-6 mt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-semibold text-[15px] flex items-center gap-2">
              <Confetti size={18} weight="bold" className="text-emerald-400" /> Party mode
            </h2>
            <p className="text-[13px] text-ink-soft mt-1">
              Play a fullscreen celebration clip when a new sale lands, while a tab is open.
              Drop clips in public/memes and list them in src/lib/celebration.js.
            </p>
          </div>
          {/* Toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={partyOn}
            onClick={() => {
              const next = !partyOn;
              setPartyOn(next);
              setCelebrationEnabled(next);
            }}
            className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors ${
              partyOn ? 'bg-emerald-500' : 'bg-line'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                partyOn ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
        <button
          type="button"
          onClick={() => triggerCelebration({ force: true })}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl border border-line text-[13px] font-semibold text-ink hover:bg-white/[0.04] transition-colors"
        >
          <Confetti size={15} weight="bold" /> Test it
        </button>
      </div>

      {/* The whole team, everyone's face and name in one place. */}
      <div className="bg-card rounded-xl3 border border-line shadow-card p-6 mt-4">
        <h2 className="font-semibold text-[15px] mb-1">Team</h2>
        <p className="text-[13px] text-ink-soft mb-2">
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </p>
        <div className="divide-y divide-line">
          {[...members]
            .sort((a, b) =>
              (a.nickname || a.email || '').localeCompare(b.nickname || b.email || '')
            )
            .map((m) => (
              <TeamMember key={m.id} member={m} isMe={m.id === user?.id} />
            ))}
        </div>
      </div>
    </div>
  );
}
