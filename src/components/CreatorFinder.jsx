import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, Plus, X, ArrowSquareOut } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { isMissingTable } from '@/lib/db';
import MigrationCard from '@/components/MigrationCard';

// The four follower bands the outreach plan works in. Null tier = the search
// snippet had no follower count, worth a manual look before writing them off.
const TIERS = [
  { key: 'nano', label: '~25k' },
  { key: 'small', label: 'under 100k' },
  { key: 'mid', label: '100-250k' },
  { key: 'big', label: '250k-1M' },
  { key: 'unknown', label: 'unknown' },
];

const fmtFollowers = (n) => {
  if (n == null) return '? followers';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k followers`;
  return `${n} followers`;
};

// "Find creators" button + scraped Instagram leads grouped by follower tier.
// The button queues a scrape_jobs row; your cron box (creators-cron.sh) picks
// it up within ~2 minutes, searches the niche via Brave, and fills
// creator_leads. One tap moves a lead into the outreach log above.
export default function CreatorFinder({ onOutreachAdded }) {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [job, setJob] = useState(null); // latest scrape_jobs row
  const [missing, setMissing] = useState(false);
  const [tier, setTier] = useState('nano');
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    const [leadsRes, jobRes] = await Promise.all([
      supabase.from('creator_leads').select('*').eq('status', 'new').order('followers', { ascending: false, nullsFirst: false }),
      supabase.from('scrape_jobs').select('*').order('created_at', { ascending: false }).limit(1),
    ]);
    if (leadsRes.error) {
      if (isMissingTable(leadsRes.error)) setMissing(true);
      return;
    }
    setLeads(leadsRes.data || []);
    setJob(jobRes.data?.[0] || null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While a job is queued or running, poll every 5s so results stream in
  // without a manual refresh (realtime is on for these tables, but the poll
  // keeps this correct even if the publication is off).
  const active = job && (job.status === 'pending' || job.status === 'running');
  useEffect(() => {
    if (!active) return undefined;
    pollRef.current = setInterval(load, 5000);
    return () => clearInterval(pollRef.current);
  }, [active, load]);

  const findCreators = async () => {
    if (!user || active) return;
    // The selected band rides along as the job parameter; the scraper keeps
    // every creator it finds but reports the match count for this band, and
    // the page is already filtered to it when results land.
    const params = tier === 'unknown' ? {} : { tier };
    const { data, error } = await supabase
      .from('scrape_jobs')
      .insert({ requested_by_email: user.email, params })
      .select()
      .single();
    if (error) {
      if (isMissingTable(error)) setMissing(true);
      return;
    }
    setJob(data);
  };

  const addToOutreach = async (lead) => {
    setLeads((cur) => cur.filter((l) => l.id !== lead.id));
    const creator = lead.name && lead.name !== lead.handle ? `${lead.name} (@${lead.handle})` : `@${lead.handle}`;
    const notes = [lead.followers != null ? fmtFollowers(lead.followers) : null, lead.email].filter(Boolean).join(' · ');
    const { error } = await supabase.from('outreach').insert({
      creator,
      platform: 'instagram',
      link: lead.url,
      notes: notes || null,
      added_by: user?.id,
      added_by_email: user?.email,
    });
    if (error) {
      setLeads((cur) => [lead, ...cur]); // put it back
      return;
    }
    await supabase.from('creator_leads').update({ status: 'outreached' }).eq('id', lead.id);
    onOutreachAdded?.();
  };

  const dismiss = async (lead) => {
    setLeads((cur) => cur.filter((l) => l.id !== lead.id));
    const { error } = await supabase.from('creator_leads').update({ status: 'dismissed' }).eq('id', lead.id);
    if (error) setLeads((cur) => [lead, ...cur]);
  };

  const byTier = useMemo(() => {
    const groups = { nano: [], small: [], mid: [], big: [], unknown: [] };
    for (const l of leads) groups[l.tier || 'unknown'].push(l);
    return groups;
  }, [leads]);

  if (missing) {
    return (
      <div className="mt-8">
        <MigrationCard title="Creator finder" migration="supabase-migration-13.sql" />
      </div>
    );
  }

  const shown = byTier[tier];

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-[17px] font-semibold tracking-tight">Find creators</h2>
        <button
          onClick={findCreators}
          disabled={active}
          className="flex items-center gap-1.5 py-2 px-3.5 rounded-2xl bg-coral text-black text-[13px] font-semibold shadow-cta active:scale-[0.96] transition-transform disabled:opacity-40 disabled:shadow-none"
        >
          <MagnifyingGlass size={15} weight="bold" />
          {active ? 'Searching...' : tier === 'unknown' ? 'Find creators' : `Find ${TIERS.find((t) => t.key === tier).label}`}
        </button>
      </div>
      <p className="text-ink-soft text-[13px] mb-4">
        {job?.status === 'pending' && 'Queued. The scraper picks this up within a couple of minutes.'}
        {job?.status === 'running' && 'Searching Instagram via web search, results appear below as they land.'}
        {job?.status === 'error' && `Last run failed: ${job.note || 'unknown error'}`}
        {job?.status === 'done' && `Last run: ${job.note || 'done'}`}
        {!job && 'Pick an audience size, hit the button: searches Instagram for creators in your niche to partner with (queries live in scripts/scrape-creators.mjs).'}
      </p>

      <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0 mb-4">
        {TIERS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTier(t.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-2xl text-[13px] font-semibold transition-colors ${
              tier === t.key ? 'bg-coral text-black' : 'bg-card border border-line text-ink-soft'
            }`}
          >
            {t.label} {byTier[t.key].length > 0 && `(${byTier[t.key].length})`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-ink-soft text-[13px] py-6 text-center">
          {leads.length === 0 ? 'No leads yet. Hit Find creators to run a search.' : 'Nothing in this band right now.'}
        </p>
      ) : (
        <div className="bg-card rounded-xl3 border border-line shadow-card divide-y divide-line">
          {shown.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold truncate flex items-center gap-1.5">
                  {l.name || `@${l.handle}`}
                  <a href={l.url} target="_blank" rel="noreferrer" aria-label={`Open @${l.handle} on Instagram`} className="text-coral-dark flex-shrink-0">
                    <ArrowSquareOut size={14} weight="bold" />
                  </a>
                </p>
                <p className="text-[12px] text-ink-soft truncate">
                  @{l.handle} · {fmtFollowers(l.followers)}
                  {l.email && (
                    <>
                      {' · '}
                      <a href={`mailto:${l.email}`} className="text-coral-dark font-medium">{l.email}</a>
                    </>
                  )}
                </p>
                {l.bio && <p className="text-[12px] text-ink-soft/80 truncate">{l.bio}</p>}
              </div>
              <button
                onClick={() => addToOutreach(l)}
                aria-label={`Add @${l.handle} to outreach`}
                className="flex items-center gap-1 py-1.5 px-2.5 rounded-xl bg-mint/30 text-emerald-700 text-[12px] font-semibold flex-shrink-0 active:scale-[0.96] transition-transform"
              >
                <Plus size={13} weight="bold" /> Outreach
              </button>
              <button
                onClick={() => dismiss(l)}
                aria-label={`Dismiss @${l.handle}`}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-soft hover:bg-cream flex-shrink-0"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
