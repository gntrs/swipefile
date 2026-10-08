import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowSquareOut, Star, Trash, PaperPlaneRight, UploadSimple, Check } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useMediaUrl } from '@/lib/media';
import { creativeLink, reachRating, humanVerdictPatch, euReach, VERDICTS, STATUSES } from '@/lib/ads';
import { removeMedia, attachMedia } from '@/lib/saveAd';
import { compactNum, formatNum, formatMoney } from '@/lib/format';
import { shortDate } from '@/features/ai/dates';
import { Skeleton } from '@/components/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { TEAM_MODE } from '@/lib/modules';
import AdDetailKeys from '@/features/save/AdDetailKeys';
import WhyItWorks from '@/features/ai/WhyItWorks';
import { readListContext } from '@/lib/library/listContext';
import {
  Page,
  PageHeader,
  Button,
  IconButton,
  Panel,
  Metrics,
  Badge,
  Meta,
  Field,
  EmptyState,
  Notice,
  inputCls,
  selectCls,
} from '@/components/ui';
import { byId } from '@/lib/byId';

const VERDICT_TONE = { winner: 'good', loser: 'bad', testing: 'warn', unsure: 'neutral' };

const cap = (s) => (s ? `${String(s).charAt(0).toUpperCase()}${String(s).slice(1)}` : s);
const pos = (v) => Number.isFinite(+v) && +v > 0;

// The numbers on the ad page, in two fixed sets so the grid keeps its shape:
// what we paid and got for our own ads, and how far a rival's ad travelled.
// A set shows when any of its numbers is known; the rest print a muted hyphen.
function performanceItems(ad) {
  const m = ad.metrics || {};
  const items = [];
  if (pos(m.ctr) || pos(m.cpc) || pos(m.spend) || pos(m.clicks) || pos(m.impressions)) {
    items.push(
      { key: 'ctr', label: 'CTR', value: pos(m.ctr) ? `${(+m.ctr).toFixed(1)}%` : null },
      { key: 'cpc', label: 'CPC', value: pos(m.cpc) ? formatMoney(m.cpc) : null },
      { key: 'spend', label: 'Spend', value: pos(m.spend) ? formatMoney(m.spend) : null },
      { key: 'clicks', label: 'Clicks', value: pos(m.clicks) ? formatNum(m.clicks) : null },
      { key: 'impressions', label: 'Impressions', value: pos(m.impressions) ? compactNum(m.impressions) : null }
    );
  }
  const days = typeof m.days_running === 'number' ? m.days_running : null;
  const eu = euReach(ad);
  if (pos(m.reach) || pos(m.reach_per_day) || days !== null || eu) {
    items.push(
      { key: 'reach', label: 'Reach', value: pos(m.reach) ? compactNum(m.reach) : null },
      { key: 'perday', label: 'Per day', value: pos(m.reach_per_day) ? compactNum(m.reach_per_day) : null },
      { key: 'days', label: 'Days live', value: days === null ? null : String(days) },
      { key: 'eu', label: 'EU reach', value: eu ? compactNum(eu) : null }
    );
  }
  return items;
}

const linkCls =
  'inline-flex items-center gap-1.5 min-h-[44px] max-w-full text-ui font-medium text-ink underline underline-offset-4 decoration-ink-soft/60 hover:decoration-ink break-all';

function SubLabel({ children }) {
  return <p className="text-small font-medium text-ink-soft mb-1">{children}</p>;
}

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
  const listPath = () => `/ads${readListContext()?.search || ''}`;
  const backToList = () => navigate(listPath());

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
    const { error } = await byId(db.from('ads').update(fields), id);
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
    const { error } = await byId(db.from('ads').delete(), id);
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
      <Page id="ad-detail" aria-busy="true">
        <span className="sr-only">Loading...</span>
        <Skeleton className="w-24 h-4 mb-6" />
        <Skeleton className="w-56 h-8 mb-3" />
        <Skeleton className="w-40 h-4 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-6">
          <Skeleton className="md:col-span-5 aspect-[4/5] max-h-[70dvh] rounded-xl3" />
          <div className="md:col-span-7 flex flex-col gap-4 lg:gap-6">
            <Skeleton className="h-36 rounded-xl3" />
            <Skeleton className="h-28 rounded-xl3" />
            <Skeleton className="h-48 rounded-xl3" />
          </div>
        </div>
      </Page>
    );
  }
  if (!ad) {
    return (
      <Page id="ad-detail">
        <EmptyState
          page
          title="Ad not found."
          text="It may have been deleted, or the link is wrong."
          action={<Button to={listPath()}>Back to the library</Button>}
        />
      </Page>
    );
  }

  const m = ad.metrics || {};
  const starred = Boolean(m.starred);
  // When we have no stored creative, fall back to any thumbnail the importer
  // captured (may be a hotlinked CDN url that fails: onError drops to the
  // branded placeholder below).
  const thumb = !src && !imgBroken ? m.thumbnail || m.image_url || m.thumbnail_url || m.creative_url || null : null;
  const rating = reachRating(ad);
  const items = performanceItems(ad);
  const activity = [
    typeof m.live === 'boolean' ? (m.live ? 'Live now' : 'Stopped') : null,
    m.started_running && shortDate(m.started_running) ? `since ${shortDate(m.started_running)}` : null,
    m.last_synced && shortDate(m.last_synced) ? `synced ${shortDate(m.last_synced)}` : null,
  ];
  const hasActivity = activity.some(Boolean);
  const drivers = Array.isArray(m.emotional_drivers) ? m.emotional_drivers.filter(Boolean) : [];
  const tags = Array.isArray(ad.tags) ? ad.tags : [];

  const live =
    typeof m.live === 'boolean' ? (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${m.live ? 'bg-status-live' : 'ring-1 ring-inset ring-ink-soft'}`} />
        <span className={m.live ? 'text-ink' : ''}>{m.live ? 'Running' : 'Stopped'}</span>
      </span>
    ) : null;

  return (
    <Page id="ad-detail">
      <PageHeader
        back={{ to: listPath(), label: 'Library' }}
        title={ad.brand || 'Untitled'}
        badge={<Badge tone={VERDICT_TONE[ad.verdict] || 'neutral'}>{cap(ad.verdict || 'unsure')}</Badge>}
        context={
          <Meta
            items={[
              cap(ad.platform),
              ad.format,
              live,
              ad.added_by_email ? `added by ${displayName(ad.added_by_email)}` : null,
            ]}
          />
        }
        actions={
          <>
            <Button
              onClick={toggleStar}
              aria-pressed={starred}
              aria-label={starred ? 'Starred' : 'Star'}
              className="max-sm:px-0 max-sm:w-11"
              icon={<Star size={16} weight={starred ? 'fill' : 'bold'} aria-hidden="true" className={`flex-shrink-0 ${starred ? 'text-ink' : ''}`} />}
            >
              <span className="hidden sm:inline">{starred ? 'Starred' : 'Star'}</span>
            </Button>
            <Button
              variant="danger"
              onClick={remove}
              disabled={deleting}
              aria-label={deleting ? 'Deleting...' : 'Delete'}
              className="max-sm:px-0 max-sm:w-11"
              icon={Trash}
            >
              <span className="hidden sm:inline">{deleting ? 'Deleting...' : 'Delete'}</span>
            </Button>
          </>
        }
      />

      {actionError && (
        <Notice tone="bad" className="mb-4 lg:mb-6">
          {actionError}
        </Notice>
      )}

      {/* GRID_SPLIT, but from md: on a tablet a full width creative would
          push every detail below the fold. */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-6">
        {/* The creative. Sticky on wide screens so the details scroll past it
            instead of leaving a hole under it. */}
        <div className="md:col-span-5 md:sticky md:top-6 self-start min-w-0">
          <div className="bg-card rounded-xl3 overflow-hidden">
            <div className="aspect-[4/5] max-h-[70dvh] w-full bg-canvas/60 flex items-center justify-center">
              {src ? (
                ad.format === 'video' ? (
                  <video src={src} controls playsInline className="w-full h-full object-contain" />
                ) : (
                  <img src={src} alt={ad.brand} className="w-full h-full object-contain" />
                )
              ) : thumb ? (
                <img src={thumb} alt={ad.brand} onError={() => setImgBroken(true)} className="w-full h-full object-contain" />
              ) : (
                // Branded placeholder and a real way to see the creative.
                <div className="flex flex-col items-center justify-center gap-3 text-center px-6">
                  <span className="w-16 h-16 rounded-xl bg-white/[0.06] flex items-center justify-center text-h2 text-ink-soft">
                    {(ad.brand || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <p className="text-body text-ink-soft">No creative saved for this ad</p>
                  <a href={creativeLink(ad)} target="_blank" rel="noreferrer" className={linkCls}>
                    See the creative <ArrowSquareOut size={14} weight="bold" aria-hidden="true" className="flex-shrink-0" />
                  </a>
                </div>
              )}
            </div>
            {!ad.media_path && (
              <div className="p-3 border-t border-line">
                <Button icon={UploadSimple} onClick={() => fileInput.current?.click()} disabled={uploading} className="w-full">
                  {uploading ? 'Uploading...' : 'Add the image or video'}
                </Button>
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
        </div>

        {/* The details, as panels. */}
        <div className="md:col-span-7 flex flex-col gap-4 lg:gap-6 min-w-0">
          {(rating || items.length > 0 || hasActivity) && (
            <Panel
              title="Performance"
              action={
                rating && (
                  <Badge tone={rating.tone} title={`Click rating: ${rating.basis}`}>
                    {`${rating.label} CTR`}
                  </Badge>
                )
              }
            >
              {items.length > 0 && <Metrics items={items} cols={3} />}
              {hasActivity && (
                <p className={`text-small text-ink-soft ${items.length ? 'mt-4' : ''}`}>
                  <Meta items={activity} />
                </p>
              )}
            </Panel>
          )}

          <Panel title="Verdict and status">
            <div className="grid grid-cols-2 gap-3 lg:gap-4">
              <Field label="Verdict" htmlFor="ad-verdict">
                <select id="ad-verdict" value={ad.verdict} onChange={(e) => setVerdict(e.target.value)} className={selectCls}>
                  {VERDICTS.map((o) => (
                    <option key={o} value={o}>
                      {cap(o)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status" htmlFor="ad-status">
                <select id="ad-status" value={ad.status} onChange={(e) => patch({ status: e.target.value })} className={selectCls}>
                  {STATUSES.map((o) => (
                    <option key={o} value={o}>
                      {cap(o)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Panel>

          <Panel title="The ad" bodyClassName="flex flex-col gap-5">
            {ad.hook && (
              <div>
                <SubLabel>Hook</SubLabel>
                <p className="text-lead font-medium text-ink whitespace-pre-line">{ad.hook}</p>
              </div>
            )}
            {ad.ad_copy && (
              <div>
                <SubLabel>Ad copy</SubLabel>
                <p className="text-body text-ink whitespace-pre-line max-w-[68ch]">{ad.ad_copy}</p>
              </div>
            )}
            {drivers.length > 0 && (
              <div>
                <SubLabel>Emotional drivers</SubLabel>
                <p className="text-body text-ink">{drivers.join(', ')}</p>
              </div>
            )}
            {m.transcription && (
              <div>
                <SubLabel>Transcript</SubLabel>
                <p className="text-body text-ink whitespace-pre-line max-w-[68ch]">{m.transcription}</p>
              </div>
            )}
            {ad.landing_url && (
              <div>
                <SubLabel>Landing page</SubLabel>
                <a href={ad.landing_url} target="_blank" rel="noreferrer" className={linkCls}>
                  {ad.landing_url}
                </a>
              </div>
            )}
            {/* The link to the ad itself (Ad Library, post url). Pasteable here
                for ads that were added without one. */}
            {m.source_url ? (
              <div>
                <SubLabel>Ad link</SubLabel>
                <a href={m.source_url} target="_blank" rel="noreferrer" className={linkCls}>
                  {m.source_url} <ArrowSquareOut size={14} weight="bold" aria-hidden="true" className="flex-shrink-0" />
                </a>
              </div>
            ) : (
              <div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = linkDraft.trim();
                    if (v) patch({ metrics: { ...(ad.metrics || {}), source_url: v } });
                  }}
                >
                  <SubLabel>Ad link</SubLabel>
                  <div className="flex items-center gap-2">
                    <input
                      id="ad-link"
                      aria-label="Ad link"
                      value={linkDraft}
                      onChange={(e) => setLinkDraft(e.target.value)}
                      placeholder="Paste the ad link (Ad Library, post url...)"
                      className={`${inputCls} flex-1 min-w-0`}
                    />
                    <IconButton type="submit" label="Save ad link" icon={Check} variant="secondary" disabled={!linkDraft.trim()} />
                  </div>
                </form>
                <a href={creativeLink(ad)} target="_blank" rel="noreferrer" className={`${linkCls} mt-1`}>
                  Search this brand in the Ad Library <ArrowSquareOut size={14} weight="bold" aria-hidden="true" className="flex-shrink-0" />
                </a>
              </div>
            )}
            {tags.length > 0 && (
              <div>
                <SubLabel>Tags</SubLabel>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <WhyItWorks ad={ad} onAdChange={setAd} />
          <AdDetailKeys ad={ad} onVerdict={setVerdict} onStar={toggleStar} onDelete={remove} />
        </div>
      </div>

      {/* Notes: shared team notes, or your own notes on a solo install. */}
      <Panel title={TEAM_MODE ? 'Team notes' : 'Notes'} flush className="mt-4 lg:mt-6">
        {comments.length === 0 ? (
          <div className="px-5 lg:px-6">
            <EmptyState text="No notes yet." className="!py-0" />
          </div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {comments.map((c) => (
              <li key={c.id} className="px-5 lg:px-6 py-3">
                <p className="text-body text-ink whitespace-pre-line">{c.body}</p>
                <p className="text-small text-ink-soft mt-0.5">
                  <Meta items={[displayName(c.author_email), shortDate(c.created_at)]} />
                </p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addComment} className="flex gap-2 px-5 lg:px-6 pt-4 pb-5 lg:pb-6">
          <label htmlFor="ad-note" className="sr-only">
            {TEAM_MODE ? 'Add a note for the team' : 'Add a note'}
          </label>
          <input
            id="ad-note"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={TEAM_MODE ? 'Add a note for the team...' : 'Add a note...'}
            className={`${inputCls} flex-1 min-w-0`}
          />
          <IconButton
            type="submit"
            label="Add note"
            variant="primary"
            icon={<PaperPlaneRight size={18} weight="fill" aria-hidden="true" />}
            disabled={sending || !newComment.trim()}
          />
        </form>
      </Panel>
    </Page>
  );
}
