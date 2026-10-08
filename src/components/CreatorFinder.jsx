import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, Plus, X, ArrowSquareOut } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { isMissingTable } from '@/lib/db';
import MigrationCard from '@/components/MigrationCard';
import { Section, Panel, Button, IconButton, Segmented, List, Row, Meta, EmptyState } from '@/components/ui';

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
// The button queues a scrape_jobs row; the cron machine (creators-cron.sh) picks
// it up within ~2 minutes, searches your CREATOR_QUERIES via Brave, and fills
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
      db.from('creator_leads').select('*').eq('status', 'new').order('followers', { ascending: false, nullsFirst: false }),
      db.from('scrape_jobs').select('*').order('created_at', { ascending: false }).limit(1),
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
    const { data, error } = await db
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
    const { error } = await db.from('outreach').insert({
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
    await db.from('creator_leads').update({ status: 'outreached' }).eq('id', lead.id);
    onOutreachAdded?.();
  };

  const dismiss = async (lead) => {
    setLeads((cur) => cur.filter((l) => l.id !== lead.id));
    const { error } = await db.from('creator_leads').update({ status: 'dismissed' }).eq('id', lead.id);
    if (error) setLeads((cur) => [lead, ...cur]);
  };

  const byTier = useMemo(() => {
    const groups = { nano: [], small: [], mid: [], big: [], unknown: [] };
    for (const l of leads) groups[l.tier || 'unknown'].push(l);
    return groups;
  }, [leads]);

  if (missing) {
    return (
      <Section title="Find creators">
        <MigrationCard title="Creator finder" migration="db-setup.sql" />
      </Section>
    );
  }

  const shown = byTier[tier];

  return (
    <Section
      title="Find creators"
      action={
        <Button variant="secondary" icon={MagnifyingGlass} onClick={findCreators} disabled={active}>
          {active ? 'Searching...' : tier === 'unknown' ? 'Find creators' : `Find ${TIERS.find((t) => t.key === tier).label}`}
        </Button>
      }
    >
      <p className="text-body text-ink-soft max-w-[68ch] mb-4">
        {job?.status === 'pending' && 'Queued. The scraper picks this up within a couple of minutes.'}
        {job?.status === 'running' && 'Searching the web for Instagram profiles, results appear below as they land.'}
        {job?.status === 'error' && `Last run failed: ${job.note || 'unknown error'}`}
        {job?.status === 'done' && `Last run: ${job.note || 'done'}`}
        {!job && (
          <>
            Pick an audience size and search. It finds public Instagram profiles through Brave Search using your{' '}
            <code className="font-mono text-small text-ink">CREATOR_QUERIES</code>.
          </>
        )}
      </p>

      <Segmented
        label="Audience size"
        options={TIERS.map((t) => ({ id: t.key, label: t.label.charAt(0).toUpperCase() + t.label.slice(1), count: byTier[t.key].length || undefined }))}
        value={tier}
        onChange={setTier}
        className="mb-4"
      />

      {shown.length === 0 ? (
        <Panel>
          <EmptyState
            text={leads.length === 0 ? 'No leads yet. Hit Find creators to run a search.' : 'Nothing in this band right now.'}
          />
        </Panel>
      ) : (
        <Panel flush>
          <List>
            {shown.map((l) => (
              <Row
                key={l.id}
                title={l.name || `@${l.handle}`}
                meta={
                  <>
                    <Meta
                      items={[
                        `@${l.handle}`,
                        <span key="f" className="whitespace-nowrap">{fmtFollowers(l.followers)}</span>,
                        l.email && (
                          <a key="e" href={`mailto:${l.email}`} className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink break-all">
                            {l.email}
                          </a>
                        ),
                      ]}
                    />
                    {l.bio && <span className="block truncate mt-0.5">{l.bio}</span>}
                  </>
                }
                trailing={
                  <>
                    <IconButton label={`Open @${l.handle} on Instagram`} href={l.url} target="_blank" rel="noreferrer" icon={ArrowSquareOut} />
                    <Button
                      variant="secondary"
                      icon={Plus}
                      onClick={() => addToOutreach(l)}
                      aria-label={`Add @${l.handle} to outreach`}
                      className="hidden sm:inline-flex"
                    >
                      Outreach
                    </Button>
                    <IconButton
                      label={`Add @${l.handle} to outreach`}
                      variant="secondary"
                      icon={Plus}
                      onClick={() => addToOutreach(l)}
                      className="sm:hidden"
                    />
                    <IconButton label={`Dismiss @${l.handle}`} icon={X} onClick={() => dismiss(l)} />
                  </>
                }
              />
            ))}
          </List>
        </Panel>
      )}
    </Section>
  );
}
