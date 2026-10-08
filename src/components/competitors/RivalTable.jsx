import React from 'react';
import { Link } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import { Badge, Delta, Meta, Panel } from '@/components/ui';
import HeatStrip from '@/components/charts/HeatStrip';
import { PERIOD, ago, heatScale, plural } from './shared';

// From lg a row is a table line: brand, running with its change, new, proven,
// the 12 week strip and last seen. Under lg it is the brand, one meta line,
// then the strip. Each row is one link to the rival's page. The lg columns
// are tighter than the xl ones and the strip shares the free width with the
// brand, so the brand keeps about 7rem at 1024 wide.
const COLS =
  'lg:grid lg:grid-cols-[minmax(0,1fr)_7.5rem_4rem_4.5rem_minmax(7rem,1fr)_4rem_1.25rem] lg:items-center lg:gap-x-3 xl:grid-cols-[minmax(0,1fr)_8.5rem_4.5rem_4.5rem_minmax(8rem,11rem)_4.5rem_1.25rem] xl:gap-x-4';

function Num({ n, label }) {
  return (
    <span className={`hidden lg:block text-right num text-ui ${n ? 'text-ink' : 'text-ink-soft'}`}>
      {n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export default function RivalTable({ board, now, dated = true }) {
  const { rows, max } = board;
  return (
    <>
      <Panel flush className="overflow-hidden" aria-label="Rival brands">
        <div
          aria-hidden="true"
          className={`${COLS} hidden min-h-[44px] px-6 border-b border-line text-small font-medium text-ink-soft`}
        >
          <span>Brand</span>
          <span className="text-right">Running</span>
          <span className="text-right">New 30d</span>
          <span className="text-right">Live 60d+</span>
          <span>{dated ? '12 weeks' : ''}</span>
          <span className="text-right">Last seen</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const seen = r.lastSeen != null ? (r.running > 0 ? null : `last seen ${ago(r.lastSeen, now)}`) : null;
            return (
              <li key={r.slug}>
                <Link
                  to={`/competitors/${r.slug}`}
                  className={`${COLS} press block min-h-[56px] px-5 lg:px-6 py-3 hover:bg-white/[0.02] transition-colors focus-visible:!outline-offset-[-2px]`}
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <span className="text-body font-medium text-ink truncate flex-shrink-0 max-w-full">{r.brand}</span>
                    {r.quiet && <Badge className="flex-shrink-0">Went quiet</Badge>}
                    <CaretRight size={14} weight="bold" aria-hidden="true" className="lg:hidden ml-auto flex-shrink-0 text-ink-soft" />
                  </span>
                  <Meta
                    className="lg:hidden block mt-0.5 text-small text-ink-soft"
                    items={[
                      <span key="run" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="num text-ink">{r.running}</span> running
                        {r.delta && <Delta delta={r.delta} period={PERIOD} />}
                      </span>,
                      r.launched > 0 && `${r.launched} new in 30d`,
                      r.provenLive > 0 && `${r.provenLive} live 60d+`,
                      !r.launched && !r.provenLive && plural(r.total, 'ad', 'ads'),
                      seen,
                    ]}
                  />
                  <span className="hidden lg:flex items-center justify-end gap-2">
                    <span className={`num text-ui ${r.running ? 'text-ink' : 'text-ink-soft'}`}>
                      {r.running}
                      <span className="sr-only"> running</span>
                    </span>
                    {r.delta && <Delta delta={r.delta} period={PERIOD} className="w-[5.25rem] flex-nowrap whitespace-nowrap" />}
                  </span>
                  <Num n={r.launched} label="new in the last 30 days" />
                  <Num n={r.provenLive} label="live 60 days or more" />
                  {dated && r.weeks ? (
                    <HeatStrip
                      values={r.weeks}
                      max={max}
                      label={`${r.brand}, ads running at each week's end`}
                      className="mt-2.5 lg:mt-0"
                    />
                  ) : (
                    <span className="hidden lg:block text-small text-ink-soft">{dated ? 'No dates' : ''}</span>
                  )}
                  <span className="hidden lg:block text-small text-ink-soft text-right whitespace-nowrap">
                    {r.lastSeen == null ? '-' : r.running > 0 ? 'now' : ago(r.lastSeen, now)}
                  </span>
                  <CaretRight size={14} weight="bold" aria-hidden="true" className="hidden lg:block text-ink-soft" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>
      {dated && max > 0 && <p className="mt-3 text-small text-ink-soft">{heatScale(max)}</p>}
    </>
  );
}
