import React, { useMemo, useState } from 'react';
import { List, Meta, Panel, Row, Segmented } from '@/components/ui';
import BarList from '@/components/charts/BarList';
import { angleLabel, angleOf } from '@/lib/angles';
import { angleMix, longestRuns } from '@/lib/rivals';
import { LiveMark, plural } from './shared';

const hookOf = (ad) => (ad?.hook || '').trim() || 'Untitled ad';

// Rival ads that started in the window, newest first: the hook, then brand,
// start age, live or stopped and angle.
export function NewPlaysList({ plays, showBrand = true, empty = 'No rival ad started in the last 30 days.' }) {
  if (!plays.length) return <p className="text-body text-ink-soft">{empty}</p>;
  return (
    <List className="-mx-5 lg:-mx-6">
      {plays.map(({ ad, startedDaysAgo, live }) => (
        <Row
          key={ad.id}
          to={`/ad/${ad.id}`}
          title={hookOf(ad)}
          meta={
            <Meta
              items={[
                showBrand && <span key="b" className="text-ink">{ad.brand.trim()}</span>,
                startedDaysAgo <= 0 ? 'started today' : `started ${startedDaysAgo}d ago`,
                <LiveMark key="s" live={live} className="align-top" />,
                angleLabel(angleOf(ad)),
              ]}
            />
          }
        />
      ))}
    </List>
  );
}

const RUN_FILTERS = [
  { id: 'live', label: 'Live now' },
  { id: 'stopped', label: 'Stopped' },
  { id: 'all', label: 'All' },
];

// The longest runs, one bar each on a scale from zero to the longest in view.
export function LongestRunsChart({ ads, isOwn, limit = 8, withFilter = true, showBrand = true }) {
  const [filter, setFilter] = useState(withFilter ? 'live' : 'all');
  const rows = useMemo(() => longestRuns(ads, { isOwn, filter, limit }), [ads, isOwn, filter, limit]);
  return (
    <>
      {withFilter && (
        <Segmented label="Which runs" options={RUN_FILTERS} value={filter} onChange={setFilter} className="mb-4" />
      )}
      {rows.length ? (
        <BarList
          caption="Days each ad has run"
          rows={rows.map(({ ad, days, live }) => ({
            key: ad.id,
            label: showBrand ? ad.brand.trim() : hookOf(ad),
            value: days,
            display: `${days}d`,
            tip: showBrand ? hookOf(ad) : null,
            to: `/ad/${ad.id}`,
            aside: <LiveMark live={live} />,
          }))}
        />
      ) : (
        <p className="text-body text-ink-soft">
          {filter === 'live'
            ? 'No rival ad is running with a known run length.'
            : filter === 'stopped'
              ? 'No stopped rival ad has a run length yet.'
              : 'No rival ad has a run length yet.'}
        </p>
      )}
    </>
  );
}

const ANGLE_SETS = [
  { id: 'running', label: 'Running now', name: 'Rival ads running now' },
  { id: 'new', label: 'New in 30 days', name: 'Rival ads started in the last 30 days' },
  { id: 'ran30', label: 'Ran 30 days or more', name: 'Rival ads that ran 30 days or more' },
];

// Angles across a set of rival ads. Rows open the library on that angle.
export function AngleMixPanel({ ads, isOwn, now }) {
  const [set, setSet] = useState('running');
  const mix = useMemo(() => angleMix(ads, { isOwn, now, set }), [ads, isOwn, now, set]);
  const meta = ANGLE_SETS.find((s) => s.id === set);
  return (
    <Panel title="Angles rivals use">
      <Segmented label="Which ads" options={ANGLE_SETS} value={set} onChange={setSet} className="mb-4" />
      {mix.total === 0 ? (
        <p className="text-body text-ink-soft">No rival ads in this set.</p>
      ) : mix.rows.length === 0 ? (
        <p className="text-body text-ink-soft">{`${meta.name}: ${plural(mix.total, 'ad', 'ads')}, none with an angle yet.`}</p>
      ) : (
        <>
          <BarList
            caption={`${meta.name}, per angle. ${plural(mix.total, 'ad', 'ads')} in this set.`}
            rows={mix.rows.map((r) => ({
              key: r.id,
              label: r.label,
              value: r.count,
              to: `/ads?who=rivals&angle=${r.id}`,
            }))}
          />
          {mix.none > 0 && (
            <p className="mt-2 text-small text-ink-soft">
              {plural(mix.none, 'ad has', 'ads have')} no angle yet.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

