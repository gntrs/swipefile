import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PencilSimple, Plus, Trash, LinkSimple } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { isMissingTable } from '@/lib/db';
import MigrationCard from '@/components/MigrationCard';
import CreatorFinder from '@/components/CreatorFinder';
import { RowsSkeleton } from '@/components/Skeleton';
import { shortDate } from '@/features/ai/dates';
import {
  Page,
  PageHeader,
  Panel,
  Field,
  Button,
  IconButton,
  Segmented,
  List,
  Row,
  Meta,
  EmptyState,
  inputCls,
  selectCls,
} from '@/components/ui';

const PLATFORMS = ['email', 'instagram', 'tiktok', 'youtube', 'other'];
const STATUSES = [
  { key: 'sent', label: 'Sent', cls: 'bg-white/[0.06] text-ink-soft' },
  { key: 'followup', label: 'Follow up', cls: 'bg-amber-500/15 text-amber-300' },
  { key: 'replied', label: 'Replied', cls: 'bg-white/[0.12] text-ink' },
  { key: 'deal', label: 'Deal', cls: 'bg-emerald-500/15 text-emerald-300' },
  { key: 'dead', label: 'Dead', cls: 'bg-red-500/15 text-red-300' },
];
const FILTERS = ['all', ...STATUSES.map((s) => s.key)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Creator collab outreach: one row per person contacted, quick status flips.
// Everyone adds and updates; the admin pen unlocks delete.
export default function Outreach() {
  const { user } = useAuth();
  const { displayName, isAdmin } = useTeam();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ creator: '', platform: 'instagram', link: '' });

  const load = useCallback(async () => {
    const { data, error } = await db
      .from('outreach')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingTable(error)) setMissing(true);
      setLoading(false);
      return;
    }
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const creator = f.creator.trim();
    if (!creator || !user) return;
    setF((cur) => ({ ...cur, creator: '', link: '' }));
    const { data, error } = await db
      .from('outreach')
      .insert({
        creator,
        platform: f.platform,
        link: f.link.trim() || null,
        added_by: user.id,
        added_by_email: user.email,
      })
      .select()
      .single();
    if (error) {
      if (isMissingTable(error)) setMissing(true);
      else setF((cur) => ({ ...cur, creator })); // give the name back
      return;
    }
    if (data) setRows((cur) => [data, ...cur]);
  };

  const setStatus = async (row, status) => {
    setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, status } : r)));
    const { error } = await db.from('outreach').update({ status }).eq('id', row.id);
    if (error) setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, status: row.status } : r)));
  };

  const remove = async (row) => {
    setRows((cur) => cur.filter((r) => r.id !== row.id));
    const { error } = await db.from('outreach').delete().eq('id', row.id);
    if (error) setRows((cur) => [row, ...cur]); // put it back
  };

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    return {
      week: rows.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length,
      replied: rows.filter((r) => r.status === 'replied' || r.status === 'deal').length,
      deals: rows.filter((r) => r.status === 'deal').length,
    };
  }, [rows]);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  // Status, link and delete for one row. Beside the row from sm, under it on a
  // phone so the name keeps the width.
  const controls = (r, st) => (
    <>
      <select
        value={r.status}
        onChange={(e) => setStatus(r, e.target.value)}
        aria-label="Status"
        className={`w-[7.5rem] min-h-[44px] pl-3 pr-1 rounded-xl text-ui font-semibold border-0 cursor-pointer ${st.cls}`}
      >
        {STATUSES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      {r.link && <IconButton label="Open link" href={r.link} target="_blank" rel="noreferrer" icon={LinkSimple} />}
      {isAdmin && editing && <IconButton label={`Delete ${r.creator}`} variant="danger" icon={Trash} onClick={() => remove(r)} />}
    </>
  );

  const header = (
    <PageHeader
      title="Creator outreach"
      context={`${stats.week} sent this week · ${stats.replied} replied · ${stats.deals} deal${stats.deals === 1 ? '' : 's'}`}
      actions={
        isAdmin && (
          <IconButton
            label="Toggle edit mode"
            icon={PencilSimple}
            variant={editing ? 'secondary' : 'ghost'}
            pressed={editing}
            onClick={() => setEditing((e) => !e)}
          />
        )
      }
    />
  );

  if (missing) {
    return (
      <Page id="outreach">
        {header}
        <MigrationCard title="Creator outreach" migration="db-setup.sql" />
      </Page>
    );
  }

  return (
    <Page id="outreach">
      {header}

      {/* Quick add: name + platform + optional link, one line on desktop */}
      <Panel title="Log a creator" className="mb-6">
        <form onSubmit={add} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_10rem_minmax(0,14rem)_auto] lg:items-end">
          <Field label="Creator" htmlFor="outreach-creator">
            <input
              id="outreach-creator"
              value={f.creator}
              onChange={(e) => setF((cur) => ({ ...cur, creator: e.target.value }))}
              placeholder="Name or @handle"
              maxLength={120}
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4 lg:contents">
            <Field label="Platform" htmlFor="outreach-platform">
              <select
                id="outreach-platform"
                value={f.platform}
                onChange={(e) => setF((cur) => ({ ...cur, platform: e.target.value }))}
                className={selectCls}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {cap(p)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Link" htmlFor="outreach-link">
              <input
                id="outreach-link"
                value={f.link}
                onChange={(e) => setF((cur) => ({ ...cur, link: e.target.value }))}
                placeholder="Optional"
                className={inputCls}
              />
            </Field>
          </div>
          <Button type="submit" variant="primary" icon={Plus} disabled={!f.creator.trim()} aria-label="Add outreach" className="justify-self-start">
            Add
          </Button>
        </form>
      </Panel>

      {/* Status filter */}
      <Segmented
        label="Status"
        options={FILTERS.map((k) => ({ id: k, label: k === 'all' ? 'All' : STATUSES.find((s) => s.key === k).label }))}
        value={filter}
        onChange={setFilter}
        className="mb-4"
      />

      {loading ? (
        <RowsSkeleton rows={3} />
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState
            text={rows.length === 0 ? 'No outreach logged yet. Add the first creator above.' : 'Nothing with this status.'}
          />
        </Panel>
      ) : (
        <Panel flush>
          <List>
            {filtered.map((r) => {
              const st = STATUSES.find((s) => s.key === r.status) || STATUSES[0];
              return (
                <Row
                  key={r.id}
                  title={r.creator}
                  meta={
                    <Meta
                      items={[
                        cap(r.platform || ''),
                        <span key="by" className="whitespace-nowrap">by {displayName(r.added_by_email)}</span>,
                        shortDate(r.created_at),
                      ]}
                    />
                  }
                  trailing={<span className="hidden sm:flex items-center gap-1">{controls(r, st)}</span>}
                >
                  <div className="flex sm:hidden items-center gap-1 px-5 pb-3 -mt-1">{controls(r, st)}</div>
                </Row>
              );
            })}
          </List>
        </Panel>
      )}

      {/* Scraped Instagram leads, one tap to pull into the log above */}
      <CreatorFinder onOutreachAdded={load} />
    </Page>
  );
}
