import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';
import { db, fetchAll } from '@/lib/db';
import PartialNotice from '@/components/PartialNotice';
import AdCard from '@/components/AdCard';
import { isOwnBrand } from '@/lib/brand';
import { brandSlug, rivalDetail } from '@/lib/rivals';
import LineChart from '@/components/charts/LineChart';
import BarList from '@/components/charts/BarList';
import { RowsSkeleton } from '@/components/Skeleton';
import { LongestRunsChart, NewPlaysList } from '@/components/competitors/Plays';
import { PERIOD, kpiCells, plural } from '@/components/competitors/shared';
import {
  Page,
  PageHeader,
  Badge,
  Button,
  Panel,
  Section,
  EmptyState,
  KpiGroup,
  GRID_CARDS,
  GRID_HALVES,
  STACK,
} from '@/components/ui';

const BACK = { to: '/competitors', label: 'Competitors' };
const SHOWN_ADS = 8;

function Tally({ title, mix, empty, to }) {
  return (
    <Panel title={title}>
      {mix.rows.length === 0 ? (
        <p className="text-body text-ink-soft">{empty}</p>
      ) : (
        <>
          <BarList
            caption={`Ads per ${title === 'Formats' ? 'format' : 'angle'}, all ${plural(mix.total, 'ad', 'ads')}`}
            rows={mix.rows.map((r) => ({ key: r.id, label: r.label, value: r.count, to: to?.(r) }))}
          />
          {mix.none > 0 && <p className="mt-2 text-small text-ink-soft">{plural(mix.none, 'ad has', 'ads have')} none yet.</p>}
        </>
      )}
    </Panel>
  );
}

// One rival brand: how active it is, what it keeps paying for, where it runs,
// and its ads. The slug comes from brandSlug(), the same one the board links.
export default function CompetitorDetail() {
  const { slug = '' } = useParams();
  const [ads, setAds] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(null);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      fetchAll((q) => q.order('created_at', { ascending: false }), 'ads'),
      db
        .from('competitors')
        .select('*')
        .then(({ data }) => data || [], () => []),
    ]).then(([adsData, trackedRows]) => {
      if (!mounted) return;
      setAds(adsData);
      setTracked(trackedRows);
      setPartial(adsData.error ? adsData : null);
      setNow(Date.now());
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [reload]);

  const d = useMemo(() => rivalDetail(ads, slug, { isOwn: isOwnBrand, now }), [ads, slug, now]);
  const track = useMemo(() => tracked.find((t) => brandSlug(t.brand) === slug) || null, [tracked, slug]);

  if (loading) {
    return (
      <Page id="competitor-detail">
        <PageHeader title="Competitor" back={BACK} />
        <KpiGroup cols={4} loading />
        <RowsSkeleton rows={3} className={STACK} />
      </Page>
    );
  }

  if (!d) {
    return (
      <Page id="competitor-detail">
        <PageHeader title="Competitor" back={BACK} />
        <PartialNotice rows={partial} onRetry={() => setReload((n) => n + 1)} className="mb-6" />
        <EmptyState
          page
          title="No ads saved from this brand."
          text="Track it on the Competitors page to pull its ads from the Meta Ad Library."
          action={
            <Button variant="secondary" to="/competitors">
              Back to Competitors
            </Button>
          }
        />
      </Page>
    );
  }

  const k = d.kpis;
  const quiet = k.running.value === 0 && k.running.prev > 0;
  const dated = k.running.dated > 0;
  const badges = (
    <span className="flex flex-wrap gap-2">
      {track && (track.page_id ? <Badge>Page linked</Badge> : <Badge tone="warn">Page id pending</Badge>)}
      {quiet && <Badge>Went quiet</Badge>}
    </span>
  );
  const countries = d.countries.rows.slice(0, 5);
  const libraryLink = `/ads?q=${encodeURIComponent(d.brand)}`;

  return (
    <Page id="competitor-detail">
      <PageHeader
        title={d.brand}
        back={BACK}
        badge={track || quiet ? badges : null}
        context={`${plural(d.ads.length, 'ad', 'ads')} saved from this brand`}
      />
      <PartialNotice rows={partial} onRetry={() => setReload((n) => n + 1)} className="mb-6" />

      <KpiGroup title="Activity" meta={PERIOD} cols={4} cells={kpiCells(k, { winners: k.winners, total: d.ads.length })} />

      <Panel title="Ads running" className={STACK}>
        {dated ? (
          <LineChart
            series={d.daily}
            unit="ads running"
            label={`${d.brand} ads running each day, last 90 days`}
            format={(v) => String(v)}
          />
        ) : (
          <p className="text-body text-ink-soft">Start and stop dates come from the Ad Library import.</p>
        )}
      </Panel>

      <div className={`${GRID_HALVES} ${STACK}`}>
        <Panel title="Longest running">
          <LongestRunsChart ads={d.ads} limit={5} withFilter={false} showBrand={false} />
        </Panel>
        <Panel title="New in the last 30 days">
          <NewPlaysList plays={d.fresh} showBrand={false} empty="No ad from this brand started in the last 30 days." />
        </Panel>
      </div>

      <div className={`${GRID_HALVES} ${STACK}`}>
        <Tally
          title="Angles they use"
          mix={d.angles}
          empty="Their ads have no angle yet."
          to={(r) => `/ads?who=rivals&angle=${r.id}&q=${encodeURIComponent(d.brand)}`}
        />
        <Tally title="Formats" mix={d.formats} empty="No format recorded." />
      </div>

      <Panel title="Countries" className={STACK}>
        {countries.length === 0 ? (
          <p className="text-body text-ink-soft">
            No country data yet. Meta only publishes countries for ads that ran in the EU.
          </p>
        ) : (
          <BarList
            caption={`EU data on ${d.countries.withData} of ${plural(d.countries.total, 'ad', 'ads')}. Ads per country.`}
            rows={countries.map((c) => ({ key: c.code, label: c.label, value: c.count }))}
          />
        )}
      </Panel>

      <Section title="Their ads" meta={plural(d.ads.length, 'ad', 'ads')}>
        <div className={GRID_CARDS}>
          {d.ads.slice(0, SHOWN_ADS).map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
        <Button variant="ghost" to={libraryLink} className="mt-3 -ml-4">
          See all {d.ads.length} in the library
          <ArrowRight size={14} weight="bold" aria-hidden="true" />
        </Button>
      </Section>
    </Page>
  );
}
