import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { db, fetchAll } from '@/lib/db';
import PartialNotice from '@/components/PartialNotice';
import { Skeleton, StatSkeleton } from '@/components/Skeleton';
import { Page, PageHeader, Button, Panel, PanelLink, Section, Stat, Meta, EmptyState, GRID_STATS } from '@/components/ui';
import TeamChat from '@/components/TeamChat';
import Goals from '@/components/Goals';
import RevenueCard from '@/components/RevenueCard';
import AdAnalytics from '@/components/AdAnalytics';
import FunnelCard from '@/components/FunnelCard';
import BarList from '@/components/charts/BarList';
import { useTeam } from '@/contexts/TeamContext';
import { isOn } from '@/lib/modules';
import { isOwnBrand } from '@/lib/brand';
import { hasPerformance } from '@/lib/ads';
import { angleLabel, angleOf } from '@/lib/angles';
import { dashboardSummary, winnerProof } from '@/lib/dashboard';
import { shortDate } from '@/features/ai/dates';

// The home screen: the four numbers that say how the swipe file is doing, what
// is working right now, which angles the winners use, and which rivals are
// busy. Ops and team cards follow only when those modules are on.

function greetingFor() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// The calm line a block shows when it has nothing to say, plus the one thing
// to do about it.
function Empty({ text, to, action }) {
  return <EmptyState text={text} action={to && <Button to={to}>{action}</Button>} />;
}

function Working({ summary }) {
  if (!summary.total)
    return <Empty text="Save your first ad, then mark the ones that work as winners." to="/ads/add" action="Add an ad" />;
  if (!summary.working.length)
    return <Empty text="No winners yet. Open an ad you trust and call it a winner." to="/ads" action="Open the library" />;
  return (
    <ol className="divide-y divide-line -mt-2">
      {summary.working.map((ad) => {
        const angle = angleOf(ad);
        const meta = [ad.brand, winnerProof(ad), angle ? angleLabel(angle) : null];
        return (
          <li key={ad.id}>
            <Link to={`/ad/${ad.id}`} className="group block py-3 min-h-[44px]">
              <p className="text-body font-medium text-ink line-clamp-2 text-pretty group-hover:text-accent-dim transition-colors">
                {ad.hook || 'Untitled ad'}
              </p>
              <Meta as="p" items={meta} className="text-small text-ink-soft mt-0.5 truncate" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Angles({ summary }) {
  if (!summary.winners)
    return <Empty text="Angles show up here once you have winners." to="/ads" action="Open the library" />;
  if (!summary.angles.length)
    return <Empty text="Your winners have no angle yet. Tag one from its ad page." to="/ads?verdict=winner" action="See the winners" />;
  const rows = summary.angles.slice(0, 6);
  const rest = summary.angles.slice(6).reduce((n, r) => n + r.count, 0);
  return (
    <>
      <BarList
        caption="Winning ads per angle, all time"
        className="-mt-1"
        rows={rows.map((r) => ({
          key: r.id,
          label: r.label,
          value: r.count,
          to: `/ads?verdict=winner&angle=${encodeURIComponent(r.id)}`,
          tip: `of ${summary.winners} ${summary.winners === 1 ? 'winner' : 'winners'} (${Math.round((r.count / summary.winners) * 100)}%)`,
        }))}
      />
      {rest > 0 && (
        <p className="text-small text-ink-soft mt-2">
          {rest} more {rest === 1 ? 'winner' : 'winners'} in {summary.angles.length - 6} other{' '}
          {summary.angles.length - 6 === 1 ? 'angle' : 'angles'}
        </p>
      )}
      {summary.noAngle > 0 && (
        <p className="text-small text-ink-soft mt-3">
          {summary.noAngle} {summary.noAngle === 1 ? 'winner has' : 'winners have'} no angle yet
        </p>
      )}
    </>
  );
}

function Rivals({ summary }) {
  const track = isOn('competitors') ? '/competitors' : '/ads/add';
  if (!summary.rivals.length)
    return <Empty text="No rival is running ads you saved. Track a brand to see who is busy." to={track} action="Track a rival" />;
  return (
    <ul className="divide-y divide-line -mt-2">
      {summary.rivals.slice(0, 5).map((r) => (
        <li key={r.brand}>
          <Link
            to={`/ads?who=rivals&q=${encodeURIComponent(r.brand)}`}
            className="group flex items-center justify-between gap-4 min-h-[48px] py-1.5"
          >
            <span className="text-body text-ink truncate group-hover:text-accent-dim transition-colors">{r.brand}</span>
            <Meta
              items={[`${r.running} running`, r.fresh ? `${r.fresh} saved in 30d` : null]}
              className="text-small text-ink-soft flex-shrink-0 whitespace-nowrap"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
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
      <div className={GRID_STATS}>
        {Array.from({ length: 4 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6 mt-4 lg:mt-6">
        <div className="xl:col-span-7 bg-card rounded-xl3 p-5 lg:p-6 space-y-4">
          <Skeleton className="w-32 h-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-10" />
          ))}
        </div>
        <div className="xl:col-span-5 bg-card rounded-xl3 p-5 lg:p-6 space-y-4">
          <Skeleton className="w-28 h-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-6" />
          ))}
        </div>
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

  const summary = useMemo(() => dashboardSummary(ads, { isOwn: isOwnBrand, top: 7 }), [ads]);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const myName = me?.nickname || '';
  const team = isOn('team');
  const ops = isOn('ops');
  const opsData = useOpsData(ops);
  const ownPerf = useMemo(() => ads.some((a) => isOwnBrand(a.brand) && hasPerformance(a)), [ads]);
  const showOps = ops && (opsData.sales > 0 || opsData.snapshots > 0 || ownPerf);

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
          <div className={GRID_STATS}>
            <Stat label="Ads saved" value={summary.total} to="/ads" />
            <Stat label="Winners" value={summary.winners} to="/ads?verdict=winner" />
            <Stat label="Running now" value={summary.running} to="/ads?sort=longest" />
            <Stat label="New this week" value={summary.newThisWeek} to="/ads" />
          </div>

          <div className={`grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6 mt-4 lg:mt-6 ${summary.working.length ? '' : 'items-start'}`}>
            <Panel
              title="What is working"
              className="xl:col-span-7"
              action={summary.working.length > 0 && <PanelLink to="/ads?verdict=winner">All winners</PanelLink>}
            >
              <Working summary={summary} />
            </Panel>

            <div className="xl:col-span-5 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 gap-4 lg:gap-6 items-start min-w-0">
              <Panel
                title="Winners by angle"
                action={isOn('hooks') && summary.angles.length > 0 && <PanelLink to="/hooks">Hook bank</PanelLink>}
              >
                <Angles summary={summary} />
              </Panel>
              {isOn('competitors') && (
                <Panel
                  title="Busy rivals"
                  action={summary.rivals.length > 0 && <PanelLink to="/competitors">All rivals</PanelLink>}
                >
                  <Rivals summary={summary} />
                </Panel>
              )}
            </div>
          </div>

          {showOps && (
            <Section title="Performance">
              <div className="grid grid-cols-1 gap-4 lg:gap-6 min-w-0">
                {(opsData.sales > 0 || opsData.snapshots > 0) && <RevenueCard />}
                {ownPerf && <AdAnalytics ads={ads} />}
                {opsData.snapshots > 0 && <FunnelCard />}
              </div>
            </Section>
          )}

          {team && (
            <Section title="Team">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-start min-w-0">
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
