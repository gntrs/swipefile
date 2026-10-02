import React from 'react';
import { Link } from 'react-router-dom';

// Key numbers: one card per group, a title and a meta line that names the
// period once, then cells split by hairlines (a gap-px grid on the line
// colour). Each cell is a label, the number in mono ink (never coloured), and
// one foot line: a <Delta/>, a <StatusDot/> or plain text. A cell with `to`
// is one link. A missing value prints a muted hyphen, a 0 is ink soft.
//
// cells: [{ id, label, value, to?, foot?, srText? }]. srText is read after the
// cell by screen readers only, for what the foot does not already say.
const COLS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' };
const missing = (v) => v === null || v === undefined || v === '';
const isZero = (v) => v === 0 || v === '0';

// One inset for the header and the cells, the same as a Panel from sm up.
// Under sm a three across row needs the room, so the inset steps down there.
const PAD_X = 'px-3 min-[380px]:px-4 sm:px-5 lg:px-6';
// Each cell is a subgrid over three rows (label, value, foot), so every value
// in a row of cells sits on one baseline even when a label wraps.
const cellCls = `grid grid-rows-subgrid row-span-3 gap-y-1.5 content-start min-w-0 min-h-[88px] bg-card ${PAD_X} py-4 lg:py-5`;

function CellBody({ label, value, foot, srText }) {
  const valueCls = missing(value) || isZero(value) ? 'text-ink-soft' : 'text-ink';
  return (
    <>
      <span className="text-small font-medium text-ink-soft min-w-0">{label}</span>
      <span className={`num text-num-md truncate ${valueCls}`}>{missing(value) ? '-' : value}</span>
      {foot != null && foot !== false && foot !== '' ? (
        <span className="self-end min-w-0 text-small text-ink-soft break-words">{foot}</span>
      ) : (
        <span aria-hidden="true" />
      )}
      {srText && <span className="sr-only">{srText}</span>}
    </>
  );
}

function Skeleton() {
  return (
    <div className={cellCls} aria-hidden="true">
      <span className="block h-3.5 w-16 rounded bg-white/[0.06]" />
      <span className="block h-6 w-14 rounded bg-white/[0.06]" />
      <span className="block h-3.5 w-12 self-end rounded bg-white/[0.04]" />
    </div>
  );
}

export function KpiGroup({ title, meta, cols = 3, cells = [], loading = false, className = '', ...rest }) {
  const n = COLS[cols] ? cols : 3;
  const list = loading ? Array.from({ length: n }, (_, i) => ({ id: `skeleton-${i}` })) : cells || [];
  // Empty cells finish the last row, so the line colour of the grid never
  // shows through a hole.
  const fill = (n - (list.length % n)) % n;
  return (
    <section
      className={`flex flex-col bg-card rounded-xl3 overflow-hidden min-w-0 ${className}`}
      aria-busy={loading ? 'true' : undefined}
      {...rest}
    >
      {(title || meta) && (
        <header className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 min-h-[28px] box-content ${PAD_X} pt-5 lg:pt-6 pb-4`}>
          {title ? <h2 className="text-title text-ink min-w-0">{title}</h2> : <span />}
          {meta && <p className="text-small text-ink-soft">{meta}</p>}
        </header>
      )}
      {/* In a row of groups that stretch to one height, the spare room goes to
          the foot row, so values and feet still line up across the groups. */}
      <div className={`grid ${COLS[n]} gap-px bg-line border-t border-line flex-1 grid-rows-[auto_auto_1fr]`}>
        {list.map((c, i) =>
          loading ? (
            <Skeleton key={c.id} />
          ) : c.to ? (
            <Link key={c.id ?? i} to={c.to} className={`${cellCls} press hover:bg-card-hi transition-colors`}>
              <CellBody {...c} />
            </Link>
          ) : (
            <div key={c.id ?? i} className={cellCls}>
              <CellBody {...c} />
            </div>
          )
        )}
        {Array.from({ length: fill }, (_, i) => (
          <div key={`fill-${i}`} aria-hidden="true" className="row-span-3 bg-card" />
        ))}
      </div>
    </section>
  );
}

export default KpiGroup;
