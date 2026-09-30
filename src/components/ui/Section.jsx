import React from 'react';

// A heading between panels, with no surface of its own. `first` drops the top
// margin when the section opens the page body. `label` is a small Figtree line
// above the heading ("Step 1").
export default function Section({ title, action, meta, label, first = false, as: Tag = 'section', className = '', children, ...rest }) {
  return (
    <Tag className={`${first ? '' : 'mt-10 lg:mt-12'} ${className}`} {...rest}>
      {/* A 44 tall action button centres on the heading; a meta line sits on its baseline. */}
      <div className={`flex flex-wrap ${action && !label ? 'items-center' : 'items-end'} justify-between gap-x-4 gap-y-2 mb-4`}>
        <div className="min-w-0">
          {label && <p className="text-small font-medium text-ink-soft mb-1">{label}</p>}
          <h2 className="text-h2 text-ink">{title}</h2>
        </div>
        {(meta || action) && (
          <div className="flex flex-shrink-0 items-center gap-3">
            {meta && <span className="text-small text-ink-soft">{meta}</span>}
            {action}
          </div>
        )}
      </div>
      {children}
    </Tag>
  );
}
