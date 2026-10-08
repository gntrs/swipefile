import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { db, fetchAll } from '@/lib/db';
import PartialNotice from '@/components/PartialNotice';
import { Skeleton } from '@/components/Skeleton';
import { Page, PageHeader, Button, Section, GRID_HALVES } from '@/components/ui';
import TeamChat from '@/components/TeamChat';
import Goals from '@/components/Goals';
import RevenueCard from '@/components/RevenueCard';
import KeyNumbers from '@/components/dashboard/KeyNumbers';
import InsightsBlock from '@/components/dashboard/InsightsBlock';
import CompetitorsBlock from '@/components/dashboard/CompetitorsBlock';
import DeepLinks from '@/components/dashboard/DeepLinks';
import { useTeam } from '@/contexts/TeamContext';
import { isOn, MODULES } from '@/lib/modules';
import { isOwnBrand, OWN_BRAND } from '@/lib/brand';
import { dashboardSummary, topMetrics, nextActions, deepLinks } from '@/lib/dashboard';
import { ownAdsSummary } from '@/lib/insights';
import { rivalAds, rivalBoard, newPlays, provenPlays, angleMix } from '@/lib/rivals';
import { shortDate } from '@/features/ai/dates';

// The home screen as an info panel: the key numbers on top, then your
// insights and the competitors as the two main areas, then links one tap
// deeper. Revenue and team follow only when those modules are on.

function greetingFor() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// Newest brief as one line under the greeting. Nothing when there is none or
// the briefs module is off.
function useLatestBrief() {
  const [brief, setBrief] = useState(null);
  useEffect(() => {
    if (!isOn('briefs')) return undefined;
    let mounted = true;
    db
      .from('briefs')
      .select('id,title,created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (mounted && data?.[0]) setBrief(data[0]);
      });
    return () => {
      mounted = false;
    };
  }, []);
  return brief;
}

// Ops cards only earn a place once their data exists: a count per table, null
// while loading or when the table is missing.
function useOpsData(on) {
  const [counts, setCounts] = useState({ sales: 0, snapshots: 0 });
  useEffect(() => {
    if (!on) return undefined;
    let mounted = true;
    const count = (table) =>
      db
        .from(table)
        .select('*', { count: 'exact', head: true })
        .then(({ count: n, error }) => (error ? 0 : n || 0), () => 0);
    Promise.all([count('sales'), count('kpi_snapshots')]).then(([sales, snapshots]) => {
      if (mounted) setCounts({ sales, snapshots });
    });
    return () => {
      mounted = false;
    };
  }, [on]);
  return counts;
}

function LoadingGrid() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading...</span>
      <KeyNumbers loading />
      <div className={`${GRID_HALVES} mt-4 lg:mt-6`}>
        {[0, 1].map((k) => (
          <div key={k} className="bg-card rounded-xl3 p-5 lg:p-6 space-y-4">
            <Skeleton className="w-32 h-4" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="w-full h-10" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(null);
  const [reload, setReload] = useState(0);
  const { me } = useTeam();
  const brief = useLatestBrief();

  useEffect(() => {
    let mounted = true;
    fetchAll((q) => q.order('created_at', { ascending: false }), 'ads').then((rows) => {
      if (!mounted) return;
      setAds(rows);
      setPartial(rows.error ? rows : null);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [reload]);

  const competitors = isOn('competitors');
  const ownBrandSet = Boolean(OWN_BRAND);
  const panel = useMemo(() => {
    const now = Date.now();
    const isOwn = isOwnBrand;
    return {
      summary: dashboardSummary(ads, { isOwn, now, top: 3 }),
      metrics: topMetrics({ ads, isOwn, ownBrandSet, now, competitorsOn: competitors }),
      actions: nextActions({ ads, isOwn, now, limit: 2 }),
      own: ownBrandSet ? ownAdsSummary(ads, { isOwn }) : null,
      rivalCount: competitors ? rivalAds(ads, isOwn).length : 0,
      board: competitors ? rivalBoard(ads, { isOwn, now }) : null,
      fresh: competitors ? newPlays(ads, { isOwn, now, liveOnly: true, limit: 3 }) : [],
      proven: competitors ? provenPlays(ads, { isOwn, now, limit: 3 }) : [],
      mix: competitors ? angleMix(ads, { isOwn, now, set: 'running' }) : null,
    };
  }, [ads, competitors, ownBrandSet]);
  const links = useMemo(
    () => deepLinks({ ads, isOwn: isOwnBrand, modules: MODULES, latestBrief: brief, now: Date.now() }),
    [ads, brief],
  );
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const myName = me?.nickname || '';
  const team = isOn('team');
  const ops = isOn('ops');
  const opsData = useOpsData(ops);
  const showRevenue = ops && (opsData.sales > 0 || opsData.snapshots > 0);

  const briefDate = brief ? shortDate(brief.created_at) : '';

  return (
    <Page id="dashboard">
      <PageHeader
        eyebrow={dateLabel}
        title={`${greetingFor()}${myName ? `, ${myName}` : ''}`}
        context={
          brief && (
            <Link
              to={`/briefs?open=${encodeURIComponent(brief.id)}`}
              className="group -my-2.5 flex items-center gap-2 min-h-[44px] max-w-full text-body text-ink-soft hover:text-ink transition-colors"
            >
              <span className="flex-shrink-0">Latest brief:</span>
              <span className="text-ink truncate group-hover:underline underline-offset-4 decoration-ink-soft">{brief.title}</span>
              {briefDate && (
                <span className="hidden sm:inline flex-shrink-0 -ml-1">
                  <span aria-hidden="true" className="text-ink-soft/50">
                    {'· '}
                  </span>
                  {briefDate}
                </span>
              )}
            </Link>
          )
        }
        actions={
          <Button variant="primary" icon={Plus} to="/ads/add">
            Add ad
          </Button>
        }
      />

      <PartialNotice rows={partial} noun="ads" onRetry={() => setReload((n) => n + 1)} className="mb-6" />

      {loading ? (
        <LoadingGrid />
      ) : (
        <>
          {panel.summary.total > 0 && <KeyNumbers metrics={panel.metrics} />}

          <div className={`${GRID_HALVES} ${panel.summary.total > 0 ? 'mt-4 lg:mt-6' : ''}`}>
            <InsightsBlock
              actions={panel.actions}
              own={panel.own}
              ownBrandSet={ownBrandSet}
              summary={panel.summary}
              wide={!competitors}
            />
            {competitors && (
              <CompetitorsBlock
                rivalCount={panel.rivalCount}
                board={panel.board}
                fresh={panel.fresh}
                proven={panel.proven}
                mix={panel.mix}
              />
            )}
          </div>

          {showRevenue && (
            <div className="mt-4 lg:mt-6 min-w-0">
              <RevenueCard />
            </div>
          )}

          <DeepLinks links={links} />

          {team && (
            <Section title="Team">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 items-start min-w-0">
                <TeamChat />
                <Goals />
              </div>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
