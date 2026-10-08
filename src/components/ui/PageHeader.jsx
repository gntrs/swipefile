import React from 'react';
import { Link } from 'react-router-dom';
import { CaretLeft } from '@phosphor-icons/react';

// The same header on every page: an optional back link, then the title with
// one line of context on the left and the actions on the right.
export default function PageHeader({ title, context, eyebrow, back, actions, badge, className = '' }) {
  return (
    <header className={`mb-6 lg:mb-8 ${className}`}>
      {back && (
        <Link
          to={back.to}
          className="press -ml-2 mb-2 inline-flex items-center gap-1.5 min-h-[44px] px-2 rounded-xl text-ui font-medium text-ink-soft hover:text-ink transition-colors"
        >
          <CaretLeft size={16} weight="bold" />
          {back.label}
        </Link>
      )}
      {/* Under lg the title block is display: contents, so the context line
          becomes its own full width row under the title and the actions
          instead of a narrow column squeezed beside them. From lg the context
          sits under the title and the actions stay top right. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 lg:gap-y-3">
        <div className="contents lg:block lg:min-w-0 lg:flex-1">
          <div className="order-1 min-w-0 flex-1 basis-40">
            {eyebrow && <p className="label-mono mb-2">{eyebrow}</p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-h1 text-ink text-balance min-w-0">{title}</h1>
              {badge}
            </div>
          </div>
          {context && <div className="order-3 basis-full min-w-0 lg:mt-2 text-body text-ink-soft max-w-[60ch]">{context}</div>}
        </div>
        {actions && <div className="order-2 flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
