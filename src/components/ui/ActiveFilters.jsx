import React from 'react';
import { RemovableChip } from './Chip';
import { Button } from './Button';

// The filters that are on, as chips that each clear their own key, plus
// Clear all. Renders nothing when no filter is on.
export default function ActiveFilters({ items = [], onClearAll, className = '' }) {
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 mb-4 ${className}`}>
      {items.map((item) => (
        <RemovableChip key={item.key} label={item.label} onRemove={item.onRemove} />
      ))}
      {onClearAll && (
        <Button variant="ghost" onClick={onClearAll}>
          Clear all
        </Button>
      )}
    </div>
  );
}
