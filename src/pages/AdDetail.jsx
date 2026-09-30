import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowSquareOut, CaretLeft, Check, LinkSimple, Trash, PaperPlaneRight, Star, UploadSimple } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useMediaUrl } from '@/lib/media';
import { creativeLink, reachRating, humanVerdictPatch, VERDICTS, STATUSES } from '@/lib/ads';
import { removeMedia, attachMedia } from '@/lib/saveAd';
import { compactNum, formatNum, formatMoney } from '@/lib/format';
import Pill from '@/components/Pill';
import { Skeleton } from '@/components/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { TEAM_MODE } from '@/lib/modules';
import AdDetailKeys from '@/features/save/AdDetailKeys';
import WhyItWorks from '@/features/ai/WhyItWorks';
import { readListContext } from '@/lib/library/listContext';

const VERDICT_TONE = { winner: 'good', loser: 'bad', testing: 'warn', unsure: 'neutral' };


export default function AdDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { displayName } = useTeam();
  const [ad, setAd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [linkDraft, setLinkDraft] = useState('');
  const [imgBroken, setImgBroken] = useState(false);
  const [actionError, setActionError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  const currentId = useRef(id);
  currentId.current = id;
  const src = useMediaUrl(ad?.media_path);
  // Back to the list this ad was opened from, with its filters and page.
  const backToList = () => navigate(`/ads${readListContext()?.search || ''}`);

  useEffect(() => {
    let mounted = true;
    // J and K change the id without remounting: drop the previous ad first, so
    // nothing (a key press, a verdict) acts on it under the new id.
    setLoading(true);
    setAd(null);
    setComments([]);
    setImgBroken(false);
    setActionError('');
    setUploading(false);
    (async () => {
      const { data } = await db.from('ads').select('*').eq('id', id).single();
      if (mounted) {
        setAd(data);
        setLoading(false);
      }
      const { data: c } = await db
        .from('comments')
        .select('*')
        .eq('ad_id', id)
        .order('created_at', { ascending: true });
      if (mounted) setComments(c || []);
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // Optimistic: the change shows at once and is rolled back if the save fails.
  const patch = async (fields) => {
    const before = ad;
    setActionError('');
    setAd((a) => ({ ...a, ...fields }));
    const { error } = await db.from('ads').update(fields).eq('id', id);
    if (error) {
      setAd(before);
      setActionError(`Could not save: ${error.message}`);
    }
  };

  const setVerdict = (v) => patch(humanVerdictPatch(ad, v));
  const toggleStar = () => patch({ metrics: { ...(ad.metrics || {}), starred: !ad.metrics?.starred } });

  const remove = async () => {
    if (!confirm('Delete this ad?')) return;
    setActionError('');
    setDeleting(true);
    const { error } = await db.from('ads').delete().eq('id', id);
    if (error) {
      setDeleting(false);
      setActionError(`Could not delete: ${error.message}`);
      return;
    }
    if (ad?.media_path) await removeMedia(ad.media_path);
    backToList();
  };

  // The creative for an ad saved without one (see attachMedia). J or K may
  // move on while it uploads: only the ad it was for changes, and its error
  // is not shown on another ad.
  const addCreative = async (file) => {
    if (!file || uploading) return;
    const adId = id;
    setActionError('');
    setUploading(true);
    try {
      const upload = await attachMedia(adId, file, { user });
      setAd((a) => (a && a.id === adId ? { ...a, media_path: upload.path, format: upload.format } : a));
    } catch (err) {
      if (currentId.current === adId) setActionError(err.message || 'Upload failed.');
    } finally {
      if (currentId.current === adId) setUploading(false);
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    const body = newComment.trim();
    if (!body || sending) return;
    setActionError('');
    setSending(true);
    const { data, error } = await db
      .from('comments')
      .insert({ ad_id: id, body, author_email: user.email, author_id: user.id })
      .select()
      .single();
    setSending(false);
    if (error || !data) {
      // Keep the draft so nothing typed is lost.
      setActionError(`Could not add the note: ${error?.message || 'no answer from the database'}`);
      return;
    }
    setComments((c) => [...c, data]);
    setNewComment('');
  };

  if (loading) {
    return (
      <div className="px-5 sm:px-8 pt-6 sm:pt-8 max-w-[1040px] mx-auto" aria-busy="true">
        <span className="sr-only">Loading...</span>
        <Skeleton className="w-24 h-4 mb-8" />
        <div className="grid md:grid-cols-2 gap-6 md:gap-10">
          <Skeleton className="aspect-[4/5] rounded-xl3" />
          <div>
            <Skeleton className="w-48 h-8" />
            <Skeleton className="w-32 h-3 mt-3" />
            <Skeleton className="h-28 mt-8 rounded-xl3" />
            <Skeleton className="h-11 mt-6 rounded-xl" />
            <Skeleton className="w-full h-4 mt-8" />
            <Skeleton className="w-2/3 h-4 mt-2" />
          </div>
        </div>
      </div>
    );
  }
  if (!ad) return <div data-page="ad-detail" className="px-5 sm:px-8 py-20 text-center text-[17px] font-semibold text-ink">Ad not found.</div>;

  const m = ad.metrics || {};
  // When we have no stored creative, fall back to any thumbnail the importer
  // captured (may be a hotlinked CDN url that fails - onError drops to the
  // branded placeholder below).
  const thumb = !src && !imgBroken ? m.thumbnail || m.image_url || m.thumbnail_url || m.creative_url || null : null;
  const rating = reachRating(ad);
  const verdictTone = VERDICT_TONE[ad.verdict] || 'neutral';
  const num = (v) => Number.isFinite(+v) && +v > 0;
  const cells = [
    num(m.reach) && { label: 'Reach', value: compactNum(m.reach) },
    num(m.ctr) && { label: 'CTR', value: `${(+m.ctr).toFixed(1)}%` },
    num(m.cpc) && { label: 'CPC', value: formatMoney(m.cpc) },
    num(m.spend) && { label: 'Spend', value: formatMoney(m.spend) },
    num(m.clicks) && { label: 'Clicks', value: formatNum(m.clicks) },
    num(m.impressions) && { label: 'Impressions', value: compactNum(m.impressions) },
  ].filter(Boolean);

  return (
    <div data-page="ad-detail" className="px-5 sm:px-8 pt-4 sm:pt-6 pb-10 max-w-[1040px] mx-auto">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <button
          onClick={backToList}
          className="press flex items-center gap-1 min-h-[44px] -ml-2 px-2 rounded-xl text-ink-soft hover:text-ink text-[15px] font-medium"
        >
          <CaretLeft size={16} weight="bold" /> Library
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleStar}
            aria-pressed={Boolean(ad.metrics?.starred)}
            className={`press flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl text-[14px] font-semibold transition-colors ${
              ad.metrics?.starred ? 'bg-amber-400 text-black' : 'bg-white/[0.06] text-ink hover:bg-white/[0.1]'
            }`}
          >
            <Star size={16} weight={ad.metrics?.starred ? 'fill' : 'bold'} className={ad.metrics?.starred ? '' : 'text-amber-400'} />
            {ad.metrics?.starred ? 'Starred' : 'Star'}
          </button>
          <button
            onClick={remove}
            disabled={deleting}
            className="press flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl text-red-600 hover:bg-red-500/10 text-[14px] font-semibold transition-colors disabled:opacity-60"
          >
            <Trash size={16} weight="bold" /> {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 text-[15px] text-red-600">
          {actionError}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-6 md:gap-10">
        {/* Media. Stays in view on wide screens while the details scroll. */}
        <div className="bg-card rounded-xl3 shadow-card overflow-hidden md:sticky md:top-6 self-start">
          <div className="aspect-[4/5] bg-canvas flex items-center justify-center">
            {src ? (
              ad.format === 'video' ? (
                <video src={src} controls playsInline className="w-full h-full object-contain" />
              ) : (
                <img src={src} alt={ad.brand} className="w-full h-full object-contain" />
              )
            ) : thumb ? (
              <img
                src={thumb}
                alt={ad.brand}
                onError={() => setImgBroken(true)}
                className="w-full h-full object-contain"
              />
            ) : (
              // Branded placeholder + a real way to see the creative, instead
              // of a bare "No media" string.
              <div className="flex flex-col items-center justify-center gap-3 text-center px-6">
                <span className="w-16 h-16 rounded-xl bg-white/[0.06] flex items-center justify-center text-[24px] font-semibold text-ink-soft">
                  {(ad.brand || '?').slice(0, 1).toUpperCase()}
                </span>
                <p className="text-ink-soft text-[15px]">No creative saved for this ad</p>
                <a
                  href={creativeLink(ad)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 min-h-[44px] px-2 rounded-xl text-[15px] font-semibold text-ink underline underline-offset-4"
                >
                  See the creative <ArrowSquareOut size={13} weight="bold" className="flex-shrink-0" />
                </a>
              </div>
            )}
          </div>
          {!ad.media_path && (
            <div className="p-3 border-t border-line">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="press w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[14px] font-semibold text-ink transition-colors disabled:opacity-60"
              >
                <UploadSimple size={16} weight="bold" aria-hidden="true" />
                {uploading ? 'Uploading...' : 'Add the image or video'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/*"
                onChange={(e) => {
                  addCreative(e.target.files?.[0]);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col gap-5 min-w-0">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-[1.1]">{ad.brand || 'Untitled'}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <Pill tone={verdictTone}>{ad.verdict || 'unsure'}</Pill>
              {typeof m.live === 'boolean' && (
                <Pill tone={m.live ? 'good' : 'neutral'}>{m.live ? 'Running' : 'Stopped'}</Pill>
              )}
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft">{ad.platform} · {ad.format}</span>
            </div>
            {ad.added_by_email && (
              <p className="text-ink-soft text-[14px] mt-2">Added by {displayName(ad.added_by_email)}</p>
            )}
          </div>

          {/* Performance at a glance: the rating verdict + the raw numbers,
              laid out as a clean stat grid so the data reads instantly. */}
          {(rating || cells.length > 0) && (
            <div className="bg-card rounded-xl3 shadow-card p-4 sm:p-5">
              {rating && (
                <div className="flex items-baseline gap-2.5 mb-4">
                  <span className={`font-mono text-[12px] font-medium uppercase tracking-[0.12em] ${rating.tone}`}>
                    {rating.label}
                  </span>
                  <span className="text-[13px] text-ink-soft">reach + click strength</span>
                </div>
              )}
              {cells.length > 0 && (
                <div className="grid grid-cols-3 gap-x-3 gap-y-5">
                  {cells.map((c) => (
                    <div key={c.label} className="min-w-0">
                      <p className="font-mono text-[20px] font-medium tabular-nums leading-none truncate">{c.value}</p>
                      <p className="kicker mt-2 truncate">{c.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Select label="Verdict" value={ad.verdict} options={VERDICTS} onChange={setVerdict} />
            <Select label="Status" value={ad.status} options={STATUSES} onChange={(v) => patch({ status: v })} />
          </div>

          {/* Activity numbers synced from Foreplay: how long the ad has been
              running and whether it is still live. */}
          {(typeof ad.metrics?.days_running === 'number' || typeof ad.metrics?.live === 'boolean') && (
            <Info
              label="Activity"
              value={[
                typeof ad.metrics?.live === 'boolean' ? (ad.metrics.live ? 'Live now' : 'Stopped') : null,
                typeof ad.metrics?.days_running === 'number' ? `${ad.metrics.days_running} days running` : null,
                ad.metrics?.started_running ? `since ${new Date(ad.metrics.started_running).toLocaleDateString()}` : null,
                ad.metrics?.last_synced ? `synced ${new Date(ad.metrics.last_synced).toLocaleDateString()}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          )}

          {/* Link to the ad itself (Ad Library, post url, Foreplay). Pasteable
              here for ads that were added without one. */}
          {ad.metrics?.source_url ? (
            <Info
              label="Ad link"
              value={
                <a href={ad.metrics.source_url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4 decoration-ink-soft hover:decoration-ink break-all inline-flex items-center gap-1 min-h-[44px]">
                  {ad.metrics.source_url} <ArrowSquareOut size={14} className="flex-shrink-0" />
                </a>
              }
            />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = linkDraft.trim();
                if (v) patch({ metrics: { ...(ad.metrics || {}), source_url: v } });
              }}
              className="flex items-center gap-2"
            >
              <LinkSimple size={18} weight="bold" className="text-ink-soft flex-shrink-0" />
              <input
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                placeholder="Paste the ad link (Ad Library, post url...)"
                className="flex-1 min-w-0 min-h-[44px] py-2 px-3 rounded-xl border border-line focus:outline-none focus:border-accent bg-card text-[16px] sm:text-[14px] placeholder:text-ink-soft"
              />
              <button
                type="submit"
                disabled={!linkDraft.trim()}
                aria-label="Save ad link"
                className="press w-11 h-11 rounded-xl bg-accent text-black flex items-center justify-center flex-shrink-0 disabled:opacity-30"
              >
                <Check size={15} weight="bold" />
              </button>
            </form>
          )}
          {ad.metrics?.source_url ? (
            <Info
              label="Ad Library"
              value={
                <a href={ad.metrics.source_url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4 decoration-ink-soft hover:decoration-ink break-all inline-flex items-center gap-1 min-h-[44px]">
                  See the creative <ArrowSquareOut size={14} className="flex-shrink-0" />
                </a>
              }
            />
          ) : (
            <Info
              label="Ad Library"
              value={
                <a href={creativeLink(ad)} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4 decoration-ink-soft hover:decoration-ink break-all inline-flex items-center gap-1 min-h-[44px]">
                  Search this brand <ArrowSquareOut size={14} className="flex-shrink-0" />
                </a>
              }
            />
          )}
          {ad.hook && <Info label="Hook" value={ad.hook} />}
          {ad.ad_copy && <Info label="Ad copy" value={ad.ad_copy} />}
          {Array.isArray(ad.metrics?.emotional_drivers) && ad.metrics.emotional_drivers.length > 0 && (
            <Info label="Emotional drivers" value={ad.metrics.emotional_drivers.join(', ')} />
          )}
          {ad.metrics?.transcription && <Info label="Transcript" value={ad.metrics.transcription} />}
          {ad.landing_url && (
            <Info label="Landing" value={<a href={ad.landing_url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4 decoration-ink-soft hover:decoration-ink break-all inline-flex items-center min-h-[44px]">{ad.landing_url}</a>} />
          )}
          {Array.isArray(ad.tags) && ad.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ad.tags.map((t) => (
                <span key={t} className="text-[13px] leading-6 px-2 rounded bg-white/[0.06] text-ink-soft">{t}</span>
              ))}
            </div>
          )}
          <AdDetailKeys ad={ad} onVerdict={setVerdict} onStar={toggleStar} onDelete={remove} />
          <WhyItWorks ad={ad} onAdChange={setAd} />
        </div>
      </div>

      {/* Comments: shared team notes, or your own notes on a solo install */}
      <div className="mt-10 pt-6 border-t border-line">
        <h3 className="kicker mb-4">{TEAM_MODE ? 'Team notes' : 'Notes'}</h3>
        <div className="flex flex-col gap-2 mb-3">
          {comments.length === 0 && <p className="text-ink-soft text-[15px]">No notes yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="bg-card rounded-xl px-4 py-3">
              <p className="text-[15px] leading-relaxed">{c.body}</p>
              <p className="font-mono text-[11px] text-ink-soft mt-1.5">{displayName(c.author_email)}</p>
            </div>
          ))}
        </div>
        <form onSubmit={addComment} className="flex gap-2">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={TEAM_MODE ? 'Add a note for the team...' : 'Add a note...'}
            className="flex-1 min-w-0 min-h-[44px] py-2.5 px-3.5 rounded-xl border border-line focus:outline-none focus:border-accent bg-card text-[16px] sm:text-[15px] placeholder:text-ink-soft"
          />
          <button
            disabled={sending || !newComment.trim()}
            aria-label="Add note"
            className="press w-11 h-11 flex-shrink-0 rounded-xl bg-accent text-black flex items-center justify-center disabled:opacity-30"
          >
            <PaperPlaneRight size={18} weight="fill" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="kicker mb-1">{label}</p>
      <p className="text-[16px] leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="flex-1 min-w-0">
      <span className="kicker block mb-1.5">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[44px] py-2 px-3 rounded-xl border border-line bg-card focus:outline-none focus:border-accent text-[15px] capitalize"
      >
        {options.map((o) => (
          <option key={o} value={o} className="capitalize">{o}</option>
        ))}
      </select>
    </label>
  );
}
