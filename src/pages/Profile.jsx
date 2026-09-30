import React, { useRef, useState } from 'react';
import { Camera, User, Confetti } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { useMediaUrl } from '@/lib/media';
import { MEDIA_BUCKET, avatarPathFor, validateFile, friendlyStorageError, removeMedia, uploadBody } from '@/lib/saveAd';
import { triggerCelebration, celebrationEnabled, setCelebrationEnabled } from '@/lib/celebration';
import { isOn } from '@/lib/modules';
import { Page, PageHeader, Panel, Button, Badge, Field, inputCls, List, Row } from '@/components/ui';

const roleLabel = (role) => (role ? role.charAt(0).toUpperCase() + role.slice(1) : '');

function TeamMember({ member, isMe }) {
  const avatar = useMediaUrl(member.avatar_path);
  return (
    <Row
      leading={
        <span
          className={`w-10 h-10 rounded-full bg-canvas flex items-center justify-center overflow-hidden ${
            isMe ? 'ring-2 ring-accent/40' : ''
          }`}
        >
          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <User size={18} className="text-ink-soft" aria-hidden="true" />}
        </span>
      }
      title={
        <>
          {member.nickname?.trim() || member.email?.split('@')[0]}
          {isMe && <span className="text-ink-soft font-normal"> (you)</span>}
        </>
      }
      meta={<span className="block truncate">{member.email}</span>}
      trailing={member.role === 'admin' && <Badge>Admin</Badge>}
    />
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
    e.target.value = '';
    if (!file) return;
    const invalid = validateFile(file);
    if (invalid) {
      setMsg(invalid.message);
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      // Unique name each upload (no storage UPDATE policy needed), in the one
      // avatars/<user id>-... shape the storage policy allows.
      const path = avatarPathFor(user.id, file);
      const { error: upErr } = await db.storage.from(MEDIA_BUCKET).upload(path, uploadBody(file));
      if (upErr) throw new Error(friendlyStorageError(upErr, { size: file.size }));
      const { error } = await db.from('team').update({ avatar_path: path }).eq('id', user.id);
      if (error) {
        await removeMedia(path);
        throw error;
      }
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

  const name = me?.nickname || user?.email?.split('@')[0];

  return (
    <Page id="profile" width="narrow">
      <PageHeader title="Profile" />

      <Panel>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="press relative w-16 h-16 rounded-full bg-canvas flex items-center justify-center overflow-hidden group flex-shrink-0"
            title="Change photo"
            aria-label="Change photo"
          >
            {avatar ? (
              <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <User size={26} className="text-ink-soft" aria-hidden="true" />
            )}
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={18} color="#fff" weight="bold" aria-hidden="true" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-title text-ink min-w-0 truncate">{name}</p>
              {me?.role && <Badge>{roleLabel(me.role)}</Badge>}
            </div>
            <p className="text-small text-ink-soft truncate mt-0.5">{user?.email}</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
        </div>
        <Button onClick={() => fileRef.current?.click()} disabled={busy} icon={Camera} className="mt-4">
          Change photo
        </Button>

        <form onSubmit={save} className="mt-6 pt-6 border-t border-line">
          <Field label="Nickname" htmlFor="profile-nickname" hint="Shown on everything you add and every note you leave.">
            <input
              id="profile-nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="How the team sees you"
              maxLength={30}
              aria-describedby="profile-nickname-hint"
              className={inputCls}
            />
          </Field>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </Button>
            {msg && (
              <p role="status" className="text-small text-ink-soft">
                {msg}
              </p>
            )}
          </div>
        </form>
      </Panel>

      {/* Party mode: fullscreen celebration clip when a sale lands. Shows on
          phones too: Test taps count as user gestures, so playback works.
          Clips are user-supplied: see public/memes/README.md. Ops module. */}
      {isOn('ops') && (
        <Panel
          title="Party mode"
          className="mt-4 lg:mt-6"
          action={
            <button
              type="button"
              role="switch"
              aria-checked={partyOn}
              onClick={() => {
                const next = !partyOn;
                setPartyOn(next);
                setCelebrationEnabled(next);
              }}
              aria-label="Party mode"
              className="-my-2 -mr-1 flex-shrink-0 min-h-[44px] min-w-[48px] flex items-center justify-center"
            >
              <span className={`relative block w-12 h-7 rounded-full transition-colors ${partyOn ? 'bg-emerald-500' : 'bg-line'}`}>
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${partyOn ? 'translate-x-5' : ''}`}
                />
              </span>
            </button>
          }
        >
          <p className="text-body text-ink-soft max-w-[60ch]">
            Play a fullscreen celebration clip when a new sale lands, while a tab is open. Drop clips in{' '}
            <code className="font-mono text-small text-ink">public/memes</code> and list them in{' '}
            <code className="font-mono text-small text-ink">src/lib/celebration.js</code>.
          </p>
          <Button onClick={() => triggerCelebration({ force: true })} icon={Confetti} className="mt-4">
            Test it
          </Button>
        </Panel>
      )}

      {/* The whole team, everyone's face and name in one place. Team module. */}
      {isOn('team') && (
        <Panel
          flush
          title="Team"
          className="mt-4 lg:mt-6"
          action={
            <span className="text-small text-ink-soft">
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </span>
          }
        >
          <List className="pb-2">
            {[...members]
              .sort((a, b) => (a.nickname || a.email || '').localeCompare(b.nickname || b.email || ''))
              .map((m) => (
                <TeamMember key={m.id} member={m} isMe={m.id === user?.id} />
              ))}
          </List>
        </Panel>
      )}
    </Page>
  );
}
