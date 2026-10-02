import React from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';

// Small parts the dashboard blocks share.

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A sub section inside a panel: a small heading, no card of its own.
export function Sub({ title, caption, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <h3 className="text-small font-medium text-ink-soft">{title}</h3>
      {caption && <p className="text-small text-ink-soft mt-1">{caption}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

// The calm line a block shows when it has nothing to say, and the one thing
// to do about it.
export function Empty({ text, to, action }) {
  return <EmptyState text={text} action={to && action && <Button to={to}>{action}</Button>} />;
}

// One quiet line with an inline text link, 44 tall.
export function LineLink({ to, children }) {
  return (
    <Link
      to={to}
      className="press inline-flex items-center min-h-[44px] min-w-[44px] text-ui font-medium text-ink-soft hover:text-ink underline underline-offset-4 decoration-line transition-colors"
    >
      {children}
    </Link>
  );
}

// A row that is one link, 56 tall at least, hairline between rows.
export const ROW_LINK = 'press group block py-2.5 min-h-[56px] -mx-2 px-2 rounded-xl hover:bg-white/[0.03] transition-colors';
