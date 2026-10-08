import React from 'react';
import { Link } from 'react-router-dom';
import { StatusDot } from '@/components/ui';
import { ROW_LINK } from './shared';

// At most two things to do now, from nextActions(). A dot with its word, the
// title, one detail line. Nothing to act on renders nothing, never a filler.
export default function ActOn({ actions }) {
  if (!actions?.length) return null;
  return (
    <ul className="divide-y divide-line">
      {actions.map((a) => (
        <li key={a.id} data-action={a.id}>
          <Link to={a.to} className={ROW_LINK}>
            <StatusDot tone={a.tone}>{a.word}</StatusDot>
            <p className="text-body text-ink mt-1 line-clamp-2 text-pretty break-words group-hover:text-accent-dim transition-colors">
              {a.title}
            </p>
            <p className="text-small text-ink-soft mt-0.5 line-clamp-2 break-words">{a.detail}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
