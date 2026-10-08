import React from 'react';
import { Link } from 'react-router-dom';
import { Panel, PanelLink, Delta, StatusDot, Meta } from '@/components/ui';
import BarList from '@/components/charts/BarList';
import HeatStrip from '@/components/charts/HeatStrip';
import { angleLabel, angleOf } from '@/lib/angles';
import { Sub, Empty, plural, ROW_LINK } from './shared';

// "Competitors": who is busy now with a 12 week strip each, their new and
// proven plays, and the angles in their running ads. Built from the pure
// functions in lib/rivals.js; the Competitors page has the full tables.

const PERIOD = 'now against 30 days ago';
const TOP = 5;

function MostActive({ board, dated }) {
  const active = board.rows.filter((r) => r.running > 0);
  const shown = active.slice(0, TOP);
  const more = active.length - shown.length;
  const quiet = board.rows.filter((r) => r.quiet);
  if (!shown.length && !quiet.length) return <p className="text-body text-ink-soft">No rival ads running right now.</p>;
  const max = Math.max(1, ...shown.flatMap((r) => r.weeks || []));
  return (
    <>
      {dated && shown.length > 0 && (
        <p className="text-small text-ink-soft -mt-1 mb-1">
          Last 12 weeks. Brighter means more ads running, up to {max}.
        </p>
      )}
      <ul className="divide-y divide-line">
        {shown.map((r) => (
          <li key={r.slug} data-rival={r.slug}>
            <Link to={`/competitors/${r.slug}`} className={ROW_LINK}>
              <span className="flex flex-wrap items-center justify-between gap-x-3 min-w-0">
                <span className="text-body text-ink truncate flex-shrink-0 max-w-full group-hover:text-accent-dim transition-colors">{r.brand}</span>
                <span className="flex flex-shrink-0 items-center gap-3">
                  <span className="num text-ui text-ink whitespace-nowrap">{r.running} running</span>
                  {dated && (
                    <span className="w-[5.25rem] flex-shrink-0">
                      <Delta delta={r.delta} period={PERIOD} className="flex-nowrap whitespace-nowrap" />
                    </span>
                  )}
                </span>
              </span>
              {dated && r.weeks && (
                <HeatStrip
                  values={r.weeks}
                  max={max}
                  label={`${r.brand}, ads running at each week's end`}
                  className="mt-2"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="text-small text-ink-soft mt-2">{more} more {more === 1 ? 'rival' : 'rivals'} running ads</p>}
      {quiet.length > 0 && (
        <p className="text-small text-ink-soft mt-1">
          Went quiet:{' '}
          {quiet.map((r, i) => (
            <React.Fragment key={r.slug}>
              {i > 0 && '; '}
              <Link to={`/competitors/${r.slug}`} className="text-ink underline underline-offset-4 decoration-line inline-flex items-center min-h-[44px]">
                {r.brand}
              </Link>
              , 0 running, {r.runningPrev} thirty days ago
            </React.Fragment>
          ))}
        </p>
      )}
    </>
  );
}

// Grid placement for the two play lists. On a phone they stack, new first;
// from md they sit side by side and row i of one list shares a grid row with
// row i of the other, so the rows line up across the panel. Literal classes
// so tailwind sees them.
const ROW_START = ['md:row-start-1', 'md:row-start-2', 'md:row-start-3', 'md:row-start-4'];
const COL_START = ['md:col-start-1', 'md:col-start-2'];

function PlayRow({ p, mark }) {
  const angle = angleOf(p.ad);
  return (
    <Link to={`/ad/${p.ad.id}`} className={`${ROW_LINK} h-full`}>
      <p className="text-ui font-medium text-ink truncate">{p.ad.brand}</p>
      <p className="text-body text-ink-soft line-clamp-2 text-pretty break-words group-hover:text-ink transition-colors">
        {p.ad.hook || 'Untitled ad'}
      </p>
      <span className="flex flex-wrap items-center gap-x-2 mt-1 text-small text-ink-soft">
        <StatusDot tone="live">{mark(p)}</StatusDot>
        {angle && <Meta items={[angleLabel(angle)]} />}
      </span>
    </Link>
  );
}

function playCells({ col, title, plays, empty, mark }) {
  const at = (row) => `${COL_START[col]} ${ROW_START[row]}`;
  const cells = [
    <h4 key={`h${col}`} className={`text-small text-ink-soft ${at(0)} ${col ? 'mt-4 md:mt-0' : ''}`}>
      {title}
    </h4>,
  ];
  if (!plays.length) {
    cells.push(
      <p key={`e${col}`} className={`text-body text-ink-soft ${at(1)}`}>
        {empty}
      </p>,
    );
    return cells;
  }
  plays.slice(0, 3).forEach((p, i) => {
    cells.push(
      <div key={p.ad.id ?? `${col}-${i}`} className={`min-w-0 ${at(i + 1)} ${i > 0 ? 'border-t border-line' : ''} ${i >= 2 ? 'hidden md:block' : ''}`}>
        <PlayRow p={p} mark={mark} />
      </div>,
    );
  });
  return cells;
}

// New and proven rival plays, one list each.
function Plays({ fresh, proven }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
      {playCells({
        col: 0,
        title: 'New, last 30 days',
        plays: fresh,
        empty: 'No rival ad started in the last 30 days.',
        mark: (p) => `Live, started ${p.startedDaysAgo}d ago`,
      })}
      {playCells({
        col: 1,
        title: 'Proven, live 60 days or more',
        plays: proven,
        empty: 'No rival ad has stayed live for 60 days.',
        mark: (p) => `Live ${p.days}d`,
      })}
    </div>
  );
}

function Angles({ mix }) {
  if (!mix.rows.length) return <p className="text-body text-ink-soft">Their running ads have no angle yet.</p>;
  const rows = mix.rows.slice(0, 4);
  const rest = mix.rows.slice(4);
  const restAds = rest.reduce((n, r) => n + r.count, 0);
  return (
    <>
      <BarList
        rows={rows.map((r) => ({
          key: r.id,
          label: r.label,
          value: r.count,
          to: `/ads?who=rivals&angle=${encodeURIComponent(r.id)}`,
        }))}
      />
      {restAds > 0 && (
        <p className="text-small text-ink-soft mt-2">
          {plural(restAds, 'more ad', 'more ads')} in {plural(rest.length, 'other angle')}
        </p>
      )}
      {mix.none > 0 && (
        <p className="text-small text-ink-soft mt-1">
          {mix.none} running {mix.none === 1 ? 'ad has' : 'ads have'} no angle yet
        </p>
      )}
    </>
  );
}

export default function CompetitorsBlock({ rivalCount, board, fresh, proven, mix }) {
  const action = <PanelLink to="/competitors">All rivals</PanelLink>;
  if (!rivalCount) {
    return (
      <Panel title="Competitors" action={action} data-block="competitors">
        <Empty
          text="No rival ads yet. Track a brand to pull its ads from the Meta Ad Library."
          to="/competitors"
          action="Track a rival"
        />
      </Panel>
    );
  }
  const dated = board.rows.some((r) => r.dated > 0);
  return (
    <Panel title="Competitors" action={action} data-block="competitors">
      <div className="space-y-6">
        <Sub title="Most active now">
          <MostActive board={board} dated={dated} />
          {!dated && <p className="text-small text-ink-soft mt-2">Start and stop dates come from the Ad Library import.</p>}
        </Sub>
        <Sub title="Their plays">
          <Plays fresh={fresh} proven={proven} />
        </Sub>
        <Sub title="Angles in their running ads" caption="Rival ads running now, per angle">
          <Angles mix={mix} />
        </Sub>
      </div>
    </Panel>
  );
}
