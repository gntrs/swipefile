import React from 'react';

// What a block or a page says when it has nothing to show, and the one thing
// to do about it. Left aligned, no big icon. `page` gives it the room of a
// whole page; inside a panel it stays tight.
export default function EmptyState({ title, text, action, page = false, className = '' }) {
  return (
    <div className={`max-w-[46ch] ${page ? 'py-16' : 'py-2'} ${className}`}>
      {title && <p className="text-title text-ink">{title}</p>}
      {text && <p className={`text-body text-ink-soft ${title ? 'mt-1' : ''}`}>{text}</p>}
      {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
