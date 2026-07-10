import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowSquareOut, CaretLeft, Check, LinkSimple, Trash, PaperPlaneRight, Star } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';
import { useMediaUrl } from '@/lib/media';
import { creativeLink, reachRating } from '@/lib/ads';
import { compactNum, formatNum, formatMoney } from '@/lib/format';
import Pill from '@/components/Pill';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';

const VERDICT_TONE = { winner: 'good', loser: 'bad', testing: 'warn', unsure: 'neutral' };

const VERDICTS = ['unsure', 'winner', 'testing', 'loser'];
const STATUSES = ['running', 'dead', 'saved'];

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
  const src = useMediaUrl(ad?.media_path);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.from('ads').select('*').eq('id', id).single();
      if (mounted) {
        setAd(data);
        setLoading(false);
      }
      const { data: c } = await supabase
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

  const patch = async (fields) => {
    setAd((a) => ({ ...a, ...fields }));
    await supabase.from('ads').update(fields).eq('id', id);
  };

  const remove = async () => {
    if (!confirm('Delete this ad?')) return;
    await supabase.from('ads').delete().eq('id', id);
    navigate('/ads');
  };

  const addComment = async (e) => {
    e.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    const { data } = await supabase
      .from('comments')
      .insert({ ad_id: id, body, author_email: user.email, author_id: user.id })
      .select()
      .single();
    if (data) setComments((c) => [...c, data]);
    setNewComment('');
  };

  if (loading) return <div className="p-8 text-ink-soft">Loading...</div>;
  if (!ad) return <div className="p-8 text-ink-soft">Ad not found.</div>;

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
    <div className="px-5 sm:px-8 py-6 max-w-[1000px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate('/ads')}
          className="flex items-center gap-1 text-ink-soft text-[14px] font-medium"
        >
          <CaretLeft size={16} weight="bold" /> Library
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => patch({ metrics: { ...(ad.metrics || {}), starred: !ad.metrics?.starred } })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[14px] font-medium transition-colors ${
              ad.metrics?.starred ? 'bg-amber-400 text-white' : 'border border-line text-ink-soft hover:bg-card'
            }`}
          >
            <Star size={16} weight={ad.metrics?.starred ? 'fill' : 'bold'} />
            {ad.metrics?.starred ? 'Starred' : 'Star'}
          </button>
          <button onClick={remove} className="flex items-center gap-1 text-red-500 text-[14px] font-medium">
            <Trash size={16} weight="bold" /> Delete
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Media */}
        <div className="bg-card rounded-xl3 border border-line shadow-card overflow-hidden">
          <div className="aspect-[4/5] bg-cream flex items-center justify-center">
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
                <span className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-line flex items-center justify-center text-[24px] font-semibold text-ink-soft">
                  {(ad.brand || '?').slice(0, 1).toUpperCase()}
                </span>
                <p className="text-ink-soft text-[13px]">No creative saved for this ad</p>
                <a
                  href={creativeLink(ad)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink underline underline-offset-2"
                >
                  See the creative <ArrowSquareOut size={13} weight="bold" className="flex-shrink-0" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] font-semibold tracking-tight">{ad.brand || 'Untitled'}</h1>
              <Pill tone={verdictTone}>{ad.verdict || 'unsure'}</Pill>
              {typeof m.live === 'boolean' && (
                <Pill tone={m.live ? 'good' : 'neutral'}>{m.live ? 'Running' : 'Stopped'}</Pill>
              )}
            </div>
            <p className="text-ink-soft text-[14px] mt-0.5">{ad.platform} · {ad.format}</p>
            {ad.added_by_email && (
              <p className="text-ink-soft text-[13px] mt-1">Added by {displayName(ad.added_by_email)}</p>
            )}
          </div>

          {/* Performance at a glance: the rating verdict + the raw numbers,
              laid out as a clean stat grid so the data reads instantly. */}
          {(rating || cells.length > 0) && (
            <div className="bg-card rounded-xl3 border border-line shadow-card p-4">
              {rating && (
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[12px] font-extrabold tracking-wide px-2.5 py-1 rounded-lg ${rating.tone}`}>
                    {rating.label}
                  </span>
                  <span className="text-[12px] text-ink-soft">reach + click strength</span>
                </div>
              )}
              {cells.length > 0 && (
                <div className="grid grid-cols-3 gap-x-3 gap-y-4">
                  {cells.map((c) => (
                    <div key={c.label}>
                      <p className="font-mono text-[20px] font-semibold tabular-nums tracking-tight leading-none">{c.value}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mt-1.5">{c.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Select label="Verdict" value={ad.verdict} options={VERDICTS} onChange={(v) => patch({ verdict: v })} />
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
                <a href={ad.metrics.source_url} target="_blank" rel="noreferrer" className="text-coral-dark underline break-all inline-flex items-center gap-1">
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
              <LinkSimple size={16} className="text-ink-soft flex-shrink-0" />
              <input
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                placeholder="Paste the ad link (Ad Library, post url...)"
                className="flex-1 min-w-0 py-2 px-3 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[16px] sm:text-[13px]"
              />
              <button
                type="submit"
                disabled={!linkDraft.trim()}
                aria-label="Save ad link"
                className="w-9 h-9 rounded-2xl bg-coral text-black flex items-center justify-center flex-shrink-0 active:scale-95 disabled:opacity-40"
              >
                <Check size={15} weight="bold" />
              </button>
            </form>
          )}
          {ad.metrics?.source_url ? (
            <Info
              label="Ad Library"
              value={
                <a href={ad.metrics.source_url} target="_blank" rel="noreferrer" className="text-coral-dark underline break-all inline-flex items-center gap-1">
                  See the creative <ArrowSquareOut size={14} className="flex-shrink-0" />
                </a>
              }
            />
          ) : (
            <Info
              label="Ad Library"
              value={
                <a href={creativeLink(ad)} target="_blank" rel="noreferrer" className="text-coral-dark underline break-all inline-flex items-center gap-1">
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
            <Info label="Landing" value={<a href={ad.landing_url} target="_blank" rel="noreferrer" className="text-coral-dark underline break-all">{ad.landing_url}</a>} />
          )}
          {Array.isArray(ad.tags) && ad.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ad.tags.map((t) => (
                <span key={t} className="text-[12px] px-2.5 py-1 rounded-full bg-cream text-ink-soft">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Comments (team CRM) */}
      <div className="mt-6 bg-card rounded-xl3 border border-line shadow-card p-4">
        <h3 className="font-semibold text-[15px] mb-3">Team notes</h3>
        <div className="flex flex-col gap-3 mb-3">
          {comments.length === 0 && <p className="text-ink-soft text-[13px]">No notes yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="bg-cream rounded-2xl px-3.5 py-2.5">
              <p className="text-[14px]">{c.body}</p>
              <p className="text-[11px] text-ink-soft mt-1">{displayName(c.author_email)}</p>
            </div>
          ))}
        </div>
        <form onSubmit={addComment} className="flex gap-2">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a note for the team..."
            className="flex-1 py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-cream text-[14px]"
          />
          <button className="w-11 h-11 rounded-2xl bg-coral text-black flex items-center justify-center shadow-cta active:scale-95">
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
      <p className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="flex-1">
      <span className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide block mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full py-2 px-3 rounded-2xl border border-line bg-card focus:outline-none focus:border-coral text-[14px] capitalize"
      >
        {options.map((o) => (
          <option key={o} value={o} className="capitalize">{o}</option>
        ))}
      </select>
    </label>
  );
}
