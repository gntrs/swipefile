import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { fetchAll } from '@/lib/db';
import PartialNotice from '@/components/PartialNotice';
import { isOwnBrand } from '@/lib/brand';
import { useTeam } from '@/contexts/TeamContext';
import TrackCompetitors from '@/components/TrackCompetitors';
import { isOn } from '@/lib/modules';
import { RowsSkeleton } from '@/components/Skeleton';
import { shortDate } from '@/features/ai/dates';
import { newPlays, rivalAds, rivalBoard, rivalKpis, dailyRunning } from '@/lib/rivals';
import LineChart from '@/components/charts/LineChart';
import RivalTable from '@/components/competitors/RivalTable';
import { AngleMixPanel, LongestRunsChart, NewPlaysList } from '@/components/competitors/Plays';
import { PERIOD, kpiCells, plural } from '@/components/competitors/shared';
import {
  Page,
  PageHeader,
  Button,
  Panel,
  Section,
  List,
  Row,
  Meta,
  EmptyState,
  KpiGroup,
  SectionNav,
  useHashScroll,
  GRID_HALVES,
  STACK,
  SECTION_ANCHOR,
} from '@/components/ui';

const isCompetitor = (brand) => Boolean(brand && brand.trim()) && !isOwnBrand(brand);

const NAV = [
  { id: 'activity', label: 'Activity' },
  { id: 'rivals', label: 'Rivals' },
  { id: 'plays', label: 'Plays' },
  { id: 'angles', label: 'Angles' },
  { id: 'tracked', label: 'Tracked' },
];

const DATES_NOTE = 'Start and stop dates come from the Ad Library import.';

// What the other brands run, and what changed in 30 days. Everything comes
// from the saved ads (mostly the Meta Ad Library import): the "then" numbers
// are rebuilt from each ad's start and stop dates.
export default function Competitors() {
  const { displayName } = useTeam();
  const [ads, setAds] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(null);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;
    // Logged social posts belong to the team module: no fetch when it is off.
    Promise.all([
      fetchAll((q) => q.order('created_at', { ascending: false }), 'ads'),
      isOn('team') ? fetchAll((q) => q.order('posted_at', { ascending: false, nullsFirst: false }), 'posts') : [],
    ]).then(([adsData, postsData]) => {
      if (!mounted) return;
      setAds(adsData);
      setPosts(postsData);
      setPartial([adsData, postsData].find((rows) => rows.error) || null);
      setNow(Date.now());
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [reload]);

  useHashScroll(!loading);

  const rivals = useMemo(() => rivalAds(ads, isOwnBrand), [ads]);
  const compPosts = useMemo(() => posts.filter((p) => isCompetitor(p.brand)), [posts]);
  const opts = useMemo(() => ({ isOwn: isOwnBrand, now }), [now]);
  const kpis = useMemo(() => rivalKpis(rivals, opts), [rivals, opts]);
  const board = useMemo(() => rivalBoard(rivals, opts), [rivals, opts]);
  const daily = useMemo(() => dailyRunning(rivals, opts), [rivals, opts]);
  const fresh = useMemo(() => newPlays(rivals, opts), [rivals, opts]);
  const dated = kpis.running.dated > 0;
  const freshLive = fresh.filter((p) => p.live).length;

  return (
    <Page id="competitors">
      <PageHeader
        title="Competitors"
        context="What the other brands run, and what changed in 30 days"
        actions={
          <Button variant="primary" icon={Plus} to="/ads/add">
            Add ad
          </Button>
        }
      />
      <PartialNotice rows={partial} onRetry={() => setReload((n) => n + 1)} className="mb-6" />

      {loading ? (
        <>
          <KpiGroup title="Rivals" meta={PERIOD} cols={4} loading />
          <RowsSkeleton rows={4} className={STACK} />
        </>
      ) : rivals.length === 0 ? (
        <>
          <Panel>
            <EmptyState
              title="No rival ads yet."
              text="Track a brand below to pull its ads from the Meta Ad Library, or add one by hand with the brand filled in."
              action={
                <Button variant="secondary" to="/ads/add">
                  Add one by hand
                </Button>
              }
            />
          </Panel>
          <section id="tracked" className={`${STACK} ${SECTION_ANCHOR}`}>
            <TrackCompetitors />
          </section>
        </>
      ) : (
        <>
          <SectionNav items={NAV} />
          <KpiGroup title="Rivals" meta={PERIOD} cols={4} cells={kpiCells(kpis)} className="mt-6" />

          <Panel title="Rival ads running" id="activity" className={`${STACK} ${SECTION_ANCHOR}`}>
            {dated ? (
              <>
                <LineChart
                  series={daily}
                  unit="rival ads running"
                  label="Rival ads running each day, last 90 days"
                  format={(v) => String(v)}
                />
                <p className="mt-3 text-small text-ink-soft">
                  Rebuilt from each ad&apos;s start and stop date, for the {plural(kpis.running.dated, 'rival ad', 'rival ads')}{' '}
                  that {kpis.running.dated === 1 ? 'has' : 'have'} one.
                  {kpis.running.undatedRunning > 0 &&
                    ` ${plural(kpis.running.undatedRunning, 'live ad has', 'live ads have')} no start date and ${
                      kpis.running.undatedRunning === 1 ? 'is' : 'are'
                    } left out.`}
                </p>
              </>
            ) : (
              <p className="text-body text-ink-soft">{DATES_NOTE}</p>
            )}
          </Panel>

          <Section title="Rivals" id="rivals" meta={plural(board.rows.length, 'brand', 'brands')} className={SECTION_ANCHOR}>
            <RivalTable board={board} now={now} dated={dated} />
            {!dated && <p className="mt-3 text-small text-ink-soft">{DATES_NOTE}</p>}
          </Section>

          <Section title="Plays" id="plays" className={SECTION_ANCHOR}>
            <div className={GRID_HALVES}>
              <Panel title="Longest running">
                <LongestRunsChart ads={rivals} isOwn={isOwnBrand} />
              </Panel>
              <Panel title="New in the last 30 days">
                <p className="text-small text-ink-soft mb-3">
                  {fresh.length > 0 && `${plural(fresh.length, 'ad', 'ads')}, ${freshLive} still live. `}
                  Start dates come from the Ad Library. A refresh of an older ad can move its start date, so a burst here can
                  be a refresh.
                </p>
                <NewPlaysList plays={fresh} />
              </Panel>
            </div>
            {/* Angles sits in the Plays section with the one card gap, its own
                anchor kept for the section nav. */}
            <section id="angles" className={`${STACK} ${SECTION_ANCHOR}`}>
              <AngleMixPanel ads={rivals} isOwn={isOwnBrand} now={now} />
            </section>
          </Section>

          <Section title="Tracked" id="tracked" className={SECTION_ANCHOR}>
            <TrackCompetitors />
          </Section>
        </>
      )}

      {/* Competitor social posts (team module) */}
      {!loading && isOn('team') && (
        <Section
          title="Their social posts"
          action={
            <Button variant="secondary" icon={Plus} to="/posts/add?competitor=1">
              Log one
            </Button>
          }
        >
          {compPosts.length === 0 ? (
            <Panel>
              <EmptyState text="Nothing logged yet. Spot a competitor post worth remembering? Log it with the brand filled in." />
            </Panel>
          ) : (
            <Panel flush>
              <List>
                {compPosts.map((p) => (
                  <Row
                    key={p.id}
                    to={`/post/${p.id}`}
                    title={p.title || 'Untitled post'}
                    meta={
                      <Meta
                        items={[
                          <span key="b" className="text-ink">
                            {p.brand.trim()}
                          </span>,
                          p.platform,
                          p.post_type,
                          shortDate(p.posted_at),
                          p.added_by_email && `by ${displayName(p.added_by_email)}`,
                        ]}
                      />
                    }
                  />
                ))}
              </List>
            </Panel>
          )}
        </Section>
      )}
    </Page>
  );
}
