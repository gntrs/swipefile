import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { fetchAll } from '@/lib/db';
import PartialNotice from '@/components/PartialNotice';
import { RowsSkeleton } from '@/components/Skeleton';
import {
  Page,
  PageHeader,
  Panel,
  Section,
  Button,
  EmptyState,
  KpiGroup,
  Delta,
  StatusDot,
  SectionNav,
  useHashScroll,
  SECTION_ANCHOR,
} from '@/components/ui';
import BarList from '@/components/charts/BarList';
import SplitBar from '@/components/charts/SplitBar';
import AdAnalytics from '@/components/AdAnalytics';
import FunnelCard from '@/components/FunnelCard';
import OwnBrandHint from '@/components/insights/OwnBrandHint';
import WinnersVsLosers from '@/components/insights/WinnersVsLosers';
import OwnGroupTable from '@/components/insights/OwnGroupTable';
import WinnerList from '@/components/insights/WinnerList';
import RevenueDaily from '@/components/insights/RevenueDaily';
import { isOn } from '@/lib/modules';
import { OWN_BRAND_NAME, isOwnBrand } from '@/lib/brand';
import { dashboardSummary } from '@/lib/dashboard';
import {
  ownAdsSummary,
  winnerLoserCompare,
  groupOwnBy,
  winnersBy,
  verdictSplit,
  libraryCounts,
} from '@/lib/insights';
import { formatMoneyShort, formatPct } from '@/lib/format';

// The angle and format tables need about 400px for their five columns, so the
// two panels of a section sit side by side only from 1400 wide.
const PAIR = 'grid grid-cols-1 min-[1400px]:grid-cols-2 gap-4 lg:gap-6';

// How your own ads perform, and what is working across the whole library.
// Own ad numbers are totals as imported from Meta with no history, so this
// page shows bands and splits for them, never a change over time. The only
// time series are site visits and revenue, and both need the ops module.

const PERIOD = 'the last 30 days against the 30 before';
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function bandFoot(band, missing) {
  return band ? <StatusDot tone={band.tone}>{band.label}</StatusDot> : missing;
}

function ownCells(own) {
  const cur = own.currency;
  return [
    { id: 'spend', label: 'Spend', value: formatMoneyShort(own.totalSpend, cur), foot: plural(own.rows.length, 'ad') },
    {
      id: 'roas',
      label: 'ROAS',
      value: own.roas.value == null ? null : own.roas.value.toFixed(2),
      foot: bandFoot(own.roasBand, 'no ROAS imported'),
      srText: own.roasBand ? `${own.roasBand.basis}, on ${plural(own.roas.ads, 'ad')}` : undefined,
    },
    {
      id: 'ctr',
      label: 'CTR',
      value: own.blendedCtr == null ? null : formatPct(own.blendedCtr),
      foot: bandFoot(own.ctrBand, 'no clicks imported'),
      srText: own.ctrBand ? own.ctrBand.basis : undefined,
    },
    {
      id: 'cpc',
      label: 'CPC',
      value: own.blendedCpc == null ? null : formatMoneyShort(own.blendedCpc, cur),
      foot: plural(own.cpcAds, 'ad'),
    },
  ];
}

function libraryCells(lib) {
  return [
    {
      id: 'saved',
      label: 'Saved, 30d',
      value: lib.saved.value,
      to: '/ads',
      foot: <Delta delta={lib.saved.delta} period={PERIOD} />,
    },
    {
      id: 'winners',
      label: 'Winners',
      value: lib.winners,
      to: '/ads?verdict=winner',
      foot: `${lib.winnersLive} still live`,
    },
    { id: 'starred', label: 'Starred', value: lib.starred, to: '/ads?starred=1', foot: 'shortlist' },
    { id: 'angle', label: 'With an angle', value: lib.withAngle, foot: `of ${plural(lib.total, 'ad')}` },
  ];
}

// A format id as a plural noun for a sentence: image to images.
const formatNoun = (row, n) => {
  const word = row.id ? row.id : 'ads with no format';
  if (!row.id) return word;
  return n === 1 ? word : word.endsWith('s') ? word : `${word}s`;
};

function SectionBlock({ id, title, meta, children }) {
  return (
    <Section id={id} title={title} meta={meta} className={SECTION_ANCHOR}>
      {children}
    </Section>
  );
}

export default function Insights() {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(null);
  const [reload, setReload] = useState(0);
  const ops = isOn('ops');

  useEffect(() => {
    let mounted = true;
    fetchAll((q) => q.order('created_at', { ascending: false }), 'ads').then((rows) => {
      if (!mounted) return;
      setAds(Array.isArray(rows) ? rows : []);
      setPartial(rows?.error ? rows : null);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [reload]);

  useHashScroll(!loading);

  const brandSet = Boolean(OWN_BRAND_NAME);
  const own = useMemo(() => ownAdsSummary(ads, { isOwn: isOwnBrand }), [ads]);
  const compare = useMemo(() => winnerLoserCompare(ads, { isOwn: isOwnBrand }), [ads]);
  const byAngle = useMemo(() => groupOwnBy(ads, 'angle', { isOwn: isOwnBrand }), [ads]);
  const byFormat = useMemo(() => groupOwnBy(ads, 'format', { isOwn: isOwnBrand }), [ads]);
  const winAngles = useMemo(() => winnersBy(ads, 'angle'), [ads]);
  const winFormats = useMemo(() => winnersBy(ads, 'format'), [ads]);
  const split = useMemo(() => verdictSplit(ads), [ads]);
  const lib = useMemo(() => libraryCounts(ads), [ads]);
  const winners = useMemo(() => dashboardSummary(ads, { isOwn: isOwnBrand, top: Infinity }).working, [ads]);

  const hasOwn = brandSet && own.hasNumbers;
  const cur = own.currency;
  const spendAds = own.spendSplit.reduce((s, r) => s + r.ads, 0);
  const spendTotal = own.spendSplit.reduce((s, r) => s + r.spend, 0);

  const nav = [
    { id: 'money', label: 'Money' },
    { id: 'ads', label: 'Your ads' },
    { id: 'angles', label: 'Angles' },
    { id: 'formats', label: 'Formats' },
    { id: 'working', label: 'Working' },
    ...(ops ? [{ id: 'site', label: 'Site' }] : []),
  ];

  const empty = !loading && lib.total === 0;

  return (
    <Page id="insights">
      <PageHeader title="Insights" context="How your ads perform, and what is working across your library" />
      <SectionNav items={nav} />

      <PartialNotice rows={partial} noun="ads" onRetry={() => setReload((n) => n + 1)} className="mt-6" />

      <div className="mt-6">
        {loading ? (
          <KpiGroup title="Your ads" cols={4} loading />
        ) : hasOwn ? (
          <>
            <KpiGroup title="Your ads" meta="as imported, no history" cols={4} cells={ownCells(own)} />
            <p className="text-small text-ink-soft mt-3">
              Totals as imported from Meta. No history is stored, so no change over time is shown.
            </p>
          </>
        ) : (
          <>
            <KpiGroup title="Your library" meta="vs 30 days ago" cols={4} cells={libraryCells(lib)} />
            <OwnBrandHint brandSet={brandSet} className="mt-3" />
          </>
        )}
        {!loading && own.otherCurrencyAds > 0 && (
          <p className="text-small text-ink-soft mt-2">
            {plural(own.otherCurrencyAds, 'ad')} in another currency not added in.
          </p>
        )}
      </div>

      {loading ? (
        <RowsSkeleton rows={4} className="mt-10" />
      ) : empty ? (
        <EmptyState
          page
          text="Save your first ad, then mark the ones that work as winners."
          action={
            <Button variant="primary" icon={Plus} to="/ads/add">
              Add an ad
            </Button>
          }
        />
      ) : (
        <>
          <SectionBlock id="money" title="Where your spend went">
            <Panel>
              {hasOwn ? (
                <>
                  <SplitBar
                    caption={`${formatMoneyShort(spendTotal, cur)} across ${plural(spendAds, 'ad')}, by verdict`}
                    segments={own.spendSplit.map((r) => ({
                      key: r.verdict,
                      tone: r.tone,
                      label: r.label,
                      value: r.spend,
                      display: formatMoneyShort(r.spend, cur),
                    }))}
                  />
                  <h3 className="text-small font-medium text-ink-soft mt-8 mb-4">Winners against losers</h3>
                  <WinnersVsLosers compare={compare} currency={cur} />
                </>
              ) : (
                <OwnBrandHint brandSet={brandSet} again />
              )}
            </Panel>
          </SectionBlock>

          <SectionBlock id="ads" title="Your ads">
            {brandSet ? <AdAnalytics ads={ads} title="Every ad with numbers" /> : <Panel><OwnBrandHint brandSet={false} again /></Panel>}
          </SectionBlock>

          <SectionBlock id="angles" title="By angle">
            <div className={PAIR}>
              <Panel title="Your ads by angle">
                {hasOwn ? (
                  <OwnGroupTable rows={byAngle} currency={cur} label="Angle" />
                ) : (
                  <OwnBrandHint brandSet={brandSet} again />
                )}
              </Panel>
              <Panel title="Winners by angle, whole library">
                {winAngles.rows.length === 0 ? (
                  <EmptyState
                    text={
                      lib.winners === 0
                        ? 'No winners yet. Open an ad you trust and call it a winner.'
                        : 'Your winners have no angle yet. Tag one from its ad page.'
                    }
                  />
                ) : (
                  <>
                    <BarList
                      caption="Winners per angle, own and rival ads"
                      rows={winAngles.rows.map((r) => ({
                        key: r.id,
                        label: r.label,
                        value: r.count,
                        to: `/ads?verdict=winner&angle=${encodeURIComponent(r.id)}`,
                      }))}
                    />
                    {winAngles.none > 0 && (
                      <p className="text-small text-ink-soft mt-3">
                        {plural(winAngles.none, 'winner has', 'winners have')} no angle yet.
                      </p>
                    )}
                  </>
                )}
              </Panel>
            </div>
          </SectionBlock>

          <SectionBlock id="formats" title="By format">
            <div className={PAIR}>
              <Panel title="Your ads by format">
                {!hasOwn ? (
                  <OwnBrandHint brandSet={brandSet} again />
                ) : byFormat.length === 1 ? (
                  <p className="text-body text-ink-soft">
                    All {byFormat[0].ads} of your ads are {formatNoun(byFormat[0], byFormat[0].ads)}. A format split needs
                    two formats.
                  </p>
                ) : (
                  <OwnGroupTable rows={byFormat} currency={cur} label="Format" />
                )}
              </Panel>
              <Panel title="Winners by format, whole library">
                {winFormats.rows.length === 0 ? (
                  <EmptyState text="No winners yet. Open an ad you trust and call it a winner." />
                ) : (
                  <>
                    <BarList
                      caption="Winners per format, own and rival ads"
                      rows={winFormats.rows.map((r) => ({
                        key: r.id,
                        label: r.label,
                        value: r.count,
                        tip: r.count === 1 ? 'winner' : 'winners',
                      }))}
                    />
                    {winFormats.none > 0 && (
                      <p className="text-small text-ink-soft mt-3">
                        {plural(winFormats.none, 'winner has', 'winners have')} no format.
                      </p>
                    )}
                  </>
                )}
              </Panel>
            </div>
          </SectionBlock>

          <SectionBlock id="working" title="What is working">
            <Panel>
              <SplitBar
                caption={`${plural(lib.total, 'ad')} in your library, by verdict`}
                segments={split.map((r) => ({ key: r.verdict, tone: r.tone, label: r.label, value: r.count }))}
              />
              <h3 className="text-small font-medium text-ink-soft mt-8 mb-2">
                {winners.length ? `Every winner, ${winners.length}` : 'Winners'}
              </h3>
              {winners.length ? (
                <WinnerList ads={winners} />
              ) : (
                <EmptyState
                  text="No winners yet. Open an ad you trust and call it a winner."
                  action={<Button to="/ads">Open the library</Button>}
                />
              )}
            </Panel>
          </SectionBlock>
        </>
      )}

      {ops && (
        <SectionBlock id="site" title="Site">
          <div className="flex flex-col gap-4 lg:gap-6">
            <FunnelCard />
            <RevenueDaily />
          </div>
        </SectionBlock>
      )}
    </Page>
  );
}
