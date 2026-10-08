import React from 'react';

// A row of tiles that scrolls sideways on a phone instead of cramping: one
// line, snap to each tile, the row bleeds to the screen edge so the next tile
// peeks, no scrollbar. From md it is whatever className makes it (a grid).
// Only for rows that would cramp on a phone; key numbers never scroll.
export default function ScrollRow({ label, className = '', itemClassName = '', children }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <ul
      aria-label={label}
      className={`scroll-x flex gap-4 snap-x snap-mandatory -mx-[var(--gutter)] px-[var(--gutter)] scroll-px-[var(--gutter)] md:mx-0 md:px-0 md:overflow-visible md:snap-none ${className}`}
    >
      {items.map((child, i) => (
        <li key={child.key ?? i} className={`flex-shrink-0 snap-start ${itemClassName}`}>
          {child}
        </li>
      ))}
    </ul>
  );
}
