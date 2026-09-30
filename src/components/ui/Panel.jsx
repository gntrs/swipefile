import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';

// The card surface every block sits on: no border, no shadow, the step from
// canvas to card is the only edge. `flush` drops the body padding so a List
// can run edge to edge (the header keeps its padding).
export function Panel({ title, action, flush = false, as: Tag = 'section', className = '', bodyClassName = '', children, ...rest }) {
  const pad = 'px-5 lg:px-6';
  const hasHeader = title || action;
  const header = hasHeader && (
    <header className={`flex items-center justify-between gap-4 min-h-[28px] mb-4 ${flush ? `${pad} pt-5 lg:pt-6` : ''}`}>
      {title ? <h2 className="text-title text-ink min-w-0">{title}</h2> : <span />}
      {action && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
  return (
    <Tag className={`bg-card rounded-xl3 min-w-0 ${flush ? '' : 'p-5 lg:p-6'} ${className}`} {...rest}>
      {header}
      {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
    </Tag>
  );
}

// The "see all" link in a panel header. 44 tall, pulled into the 28px header
// row with negative margins so it does not push the header taller.
export function PanelLink({ to, children, className = '', ...rest }) {
  return (
    <Link
      to={to}
      className={`press -my-2 -mr-2 inline-flex items-center gap-1 min-h-[44px] px-2 rounded-xl text-ui font-medium text-ink-soft hover:text-ink transition-colors ${className}`}
      {...rest}
    >
      {children}
      <ArrowRight size={14} weight="bold" aria-hidden="true" />
    </Link>
  );
}

export default Panel;
