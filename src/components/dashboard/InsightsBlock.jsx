import React from 'react';
import { Link } from 'react-router-dom';
import { Panel, PanelLink, Meta } from '@/components/ui';
import BarList from '@/components/charts/BarList';
import SplitBar from '@/components/charts/SplitBar';
import { angleLabel, angleOf } from '@/lib/angles';
import { winnerProof, moneyText } from '@/lib/dashboard';
import ActOn from './ActOn';
import { Sub, Empty, LineLink, plural, ROW_LINK } from './shared';

// "Your insights": what to act on, where your money went, and what is working
// across the library. Everything here links one tap deeper.

function Spend({ own, ownBrandSet }) {
  if (!ownBrandSet) {
    return (
      <p className="text-body text-ink-soft">
        Tell Swipefile which brand is yours to see your own numbers here. <LineLink to="/setup">Setup</LineLink>
      </p>
    );
  }
  if (!own?.hasNumbers) {
    return <p className="text-body text-ink-soft">No numbers on your ads yet. They fill in from the Meta import.</p>;
  }
  const cur = own.currency;
  const ads = own.spendSplit.reduce((n, s) => n + s.ads, 0);
  const total = own.spendSplit.reduce((n, s) => n + s.spend, 0);
  return (
    <SplitBar
      caption={`${moneyText(total, cur)} across ${plural(ads, 'ad')}, by verdict`}
      segments={own.spendSplit.map((s) => ({
        key: s.verdict,
        tone: s.tone,
        label: s.label,
        value: s.spend,
        display: moneyText(s.spend, cur),
      }))}
    />
  );
}

function Working({ summary }) {
  if (!summary.total)
    return <Empty text="Save your first ad, then mark the ones that work as winners." to="/ads/add" action="Add an ad" />;
  if (!summary.working.length)
    return <Empty text="No winners yet. Open an ad you trust and call it a winner." to="/ads" action="Open the library" />;
  return (
    <ol className="divide-y divide-line">
      {summary.working.slice(0, 3).map((ad) => {
        const angle = angleOf(ad);
        return (
          <li key={ad.id}>
            <Link to={`/ad/${ad.id}`} className={ROW_LINK}>
              <p className="text-body text-ink line-clamp-2 text-pretty break-words group-hover:text-accent-dim transition-colors">
                {ad.hook || 'Untitled ad'}
              </p>
              <Meta
                as="p"
                items={[ad.brand, winnerProof(ad), angle ? angleLabel(angle) : null]}
                className="text-small text-ink-soft mt-0.5 truncate"
              />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Angles({ summary }) {
  if (!summary.winners) return null;
  if (!summary.angles.length) {
    return (
      <p className="text-body text-ink-soft">
        Your winners have no angle yet. Tag one from its ad page. <LineLink to="/ads?verdict=winner">See the winners</LineLink>
      </p>
    );
  }
  const rows = summary.angles.slice(0, 4);
  const restRows = summary.angles.slice(4);
  const rest = restRows.reduce((n, r) => n + r.count, 0);
  return (
    <>
      <BarList
        rows={rows.map((r) => ({
          key: r.id,
          label: r.label,
          value: r.count,
          to: `/ads?verdict=winner&angle=${encodeURIComponent(r.id)}`,
        }))}
      />
      {rest > 0 && (
        <p className="text-small text-ink-soft mt-2">
          {rest} more {rest === 1 ? 'winner' : 'winners'} in {plural(restRows.length, 'other angle')}
        </p>
      )}
      {summary.noAngle > 0 && (
        <p className="text-small text-ink-soft mt-1">
          {summary.noAngle} {summary.noAngle === 1 ? 'winner has' : 'winners have'} no angle yet
        </p>
      )}
    </>
  );
}

export default function InsightsBlock({ actions, own, ownBrandSet, summary, wide = false }) {
  return (
    <Panel
      title="Your insights"
      action={<PanelLink to="/insights">Insights</PanelLink>}
      className={`flex flex-col ${wide ? 'md:col-span-2' : ''}`}
      data-block="insights"
    >
      <div className={`grid grid-cols-1 gap-6 ${wide ? 'md:grid-cols-2 md:gap-x-8' : ''}`}>
        <div className="min-w-0 space-y-6">
          {actions?.length > 0 && (
            <Sub title="Act on">
              <ActOn actions={actions} />
            </Sub>
          )}
          <Sub title="Where your spend went">
            <Spend own={own} ownBrandSet={ownBrandSet} />
          </Sub>
        </div>
        <Sub title="What is working">
          <Working summary={summary} />
          {summary.winners > 0 && (
            <div className="mt-5">
              <h4 className="text-small font-medium text-ink-soft mb-1">Winners by angle</h4>
              <Angles summary={summary} />
            </div>
          )}
        </Sub>
      </div>
      {/* The footer link sits on the bottom edge, so it lines up with the
          bottom of the Competitors panel beside it. */}
      {summary.working.length > 0 && (
        <div className="mt-auto pt-4">
          <PanelLink to="/ads?verdict=winner" className="-ml-2 -mb-2 my-0">
            All winners
          </PanelLink>
        </div>
      )}
    </Panel>
  );
}
