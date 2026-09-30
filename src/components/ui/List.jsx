import React from 'react';
import { Link } from 'react-router-dom';

// Rows inside one panel, split by hairlines. Never a card per row.
export function List({ as: Tag = 'ul', className = '', children, ...rest }) {
  return (
    <Tag className={`divide-y divide-line ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

// One row: leading (a checkbox, an avatar), the title with a meta line under
// it, and trailing content on the right (numbers, icon buttons). With `to`
// the title block is a link; leading and trailing stay outside it so a button
// is never nested in a link. `children` render under the row, full width
// (an expanded rival's ads).
export function Row({ to, leading, title, meta, trailing, selected = false, className = '', children, ...rest }) {
  const body = (
    <>
      <span className="block text-body font-medium text-ink line-clamp-2">{title}</span>
      {meta && <span className="block text-small text-ink-soft mt-0.5">{meta}</span>}
    </>
  );
  const bodyCls = 'flex-1 min-w-0 py-3';
  return (
    <li
      className={`${selected ? 'bg-white/[0.04]' : ''} ${to ? 'hover:bg-white/[0.02] transition-colors' : ''} ${className}`}
      {...rest}
    >
      <div className="flex items-center gap-3 min-h-[56px] px-5 lg:px-6">
        {leading && <div className="flex flex-shrink-0 items-center">{leading}</div>}
        {to ? (
          <Link to={to} className={`${bodyCls} self-stretch flex flex-col justify-center rounded-xl focus-visible:!outline-offset-[-2px]`}>
            {body}
          </Link>
        ) : (
          <div className={bodyCls}>{body}</div>
        )}
        {trailing && <div className="flex flex-shrink-0 items-center gap-1 text-right">{trailing}</div>}
      </div>
      {children}
    </li>
  );
}

export default List;
