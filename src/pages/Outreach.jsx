import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PaperPlaneTilt, PencilSimple, Plus, Trash, LinkSimple } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { isMissingTable } from '@/lib/db';
import MigrationCard from '@/components/MigrationCard';
import CreatorFinder from '@/components/CreatorFinder';

const PLATFORMS = ['email', 'instagram', 'tiktok', 'youtube', 'other'];
const STATUSES = [
  { key: 'sent', label: 'Sent', cls: 'bg-cream text-ink-soft' },
  { key: 'followup', label: 'Follow up', cls: 'bg-amber-100 text-amber-700' },
  { key: 'replied', label: 'Replied', cls: 'bg-coral-soft text-coral-dark' },
  { key: 'deal', label: 'Deal', cls: 'bg-mint/30 text-emerald-700' },
  { key: 'dead', label: 'Dead', cls: 'bg-red-100 text-red-600' },
];
const FILTERS = ['all', ...STATUSES.map((s) => s.key)];

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

  if (missing) {
    return (
      <div className="px-5 sm:px-8 py-6 max-w-[900px] mx-auto">
        <MigrationCard title="Creator outreach" migration="db-setup.sql" />
      </div>
    );
  }

  return (
    <div className="px-5 sm:px-8 py-6 max-w-[900px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Creator outreach</h1>
        {isAdmin && (
          <button
            onClick={() => setEditing((e) => !e)}
            aria-label="Toggle edit mode"
            className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-colors ${
              editing ? 'bg-coral text-black shadow-cta' : 'bg-card border border-line text-ink-soft'
            }`}
          >
            <PencilSimple size={16} weight="bold" />
          </button>
        )}
      </div>
      <p className="text-ink-soft text-[14px] mb-5">
        {stats.week} sent this week · {stats.replied} replied · {stats.deals} deal{stats.deals === 1 ? '' : 's'}
      </p>

      {/* Quick add: name + platform + optional link, one line on desktop */}
      <form onSubmit={add} className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          value={f.creator}
          onChange={(e) => setF((cur) => ({ ...cur, creator: e.target.value }))}
          placeholder="Creator name or @handle"
          maxLength={120}
          className="flex-1 min-w-0 py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-card text-[16px] sm:text-[14px]"
        />
        <div className="flex gap-2">
          <select
            value={f.platform}
            onChange={(e) => setF((cur) => ({ ...cur, platform: e.target.value }))}
            aria-label="Platform"
            className="flex-1 sm:flex-none py-2.5 px-3 rounded-2xl border border-line focus:outline-none focus:border-coral bg-card text-[16px] sm:text-[13px] text-ink-soft capitalize"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p} className="capitalize">{p}</option>
            ))}
          </select>
          <input
            value={f.link}
            onChange={(e) => setF((cur) => ({ ...cur, link: e.target.value }))}
            placeholder="Link (optional)"
            className="w-32 sm:w-44 py-2.5 px-3.5 rounded-2xl border border-line focus:outline-none focus:border-coral bg-card text-[16px] sm:text-[14px]"
          />
          <button
            type="submit"
            disabled={!f.creator.trim()}
            aria-label="Add outreach"
            className="press w-11 h-11 rounded-2xl bg-coral text-black flex items-center justify-center flex-shrink-0 shadow-cta disabled:opacity-40 disabled:shadow-none"
          >
            <Plus size={18} weight="bold" />
          </button>
        </div>
      </form>

      {/* Status filter */}
      <div className="flex gap-1.5 scroll-x -mx-5 px-5 sm:mx-0 sm:px-0 mb-4">
        {FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex-shrink-0 px-3 py-2 rounded-2xl text-[13px] font-semibold capitalize transition-colors ${
              filter === s ? 'bg-coral text-black' : 'bg-card border border-line text-ink-soft'
            }`}
          >
            {s === 'followup' ? 'Follow up' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-ink-soft">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-ink-soft">
          <PaperPlaneTilt size={32} className="mx-auto mb-2" />
          <p>{rows.length === 0 ? 'No outreach logged yet. Add the first creator above.' : 'Nothing with this status.'}</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl3 border border-line shadow-card divide-y divide-line">
          {filtered.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold truncate flex items-center gap-1.5">
                  {r.creator}
                  {r.link && (
                    <a href={r.link} target="_blank" rel="noreferrer" aria-label="Open link" className="text-coral-dark flex-shrink-0">
                      <LinkSimple size={14} weight="bold" />
                    </a>
                  )}
                </p>
                <p className="text-[12px] text-ink-soft truncate capitalize">
                  {r.platform} · by {displayName(r.added_by_email)} · {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <select
                value={r.status}
                onChange={(e) => setStatus(r, e.target.value)}
                aria-label="Status"
                className={`py-1.5 px-2.5 rounded-xl text-[13px] font-semibold border-0 focus:outline-none flex-shrink-0 ${
                  (STATUSES.find((s) => s.key === r.status) || STATUSES[0]).cls
                }`}
              >
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
              {isAdmin && editing && (
                <button
                  onClick={() => remove(r)}
                  aria-label={`Delete ${r.creator}`}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-red-500 hover:bg-red-50 flex-shrink-0"
                >
                  <Trash size={15} weight="bold" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Scraped Instagram leads, one tap to pull into the log above */}
      <CreatorFinder onOutreachAdded={load} />
    </div>
  );
}
