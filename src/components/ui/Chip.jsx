import React, { forwardRef } from 'react';
import { X } from '@phosphor-icons/react';
import { selectedCls } from './controls';
import { renderIcon } from './Button';

// A toggle chip. `pressed` sets aria-pressed and the selected look. With no
// children it is an icon only chip: pass aria-label.
export const Chip = forwardRef(function Chip({ pressed, icon, count, className = '', children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed === undefined ? undefined : Boolean(pressed)}
      className={`press inline-flex flex-shrink-0 items-center justify-center gap-2 min-h-[44px] min-w-[44px] ${
        children ? 'px-3.5' : 'px-2.5'
      } rounded-xl text-ui font-medium whitespace-nowrap transition-colors ${
        pressed ? selectedCls : 'bg-white/[0.06] text-ink-soft hover:text-ink'
      } ${className}`}
      {...rest}
    >
      {renderIcon(icon)}
      {children}
      {count != null && <span className={`num text-small ${pressed ? 'text-ink' : 'text-ink-soft'}`}>{count}</span>}
    </button>
  );
});

// An active filter. The whole chip is the remove button.
export function RemovableChip({ label, onRemove, className = '', ...rest }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className={`press inline-flex items-center gap-1.5 min-h-[44px] pl-3.5 pr-3 rounded-xl text-ui font-medium bg-white/[0.06] text-ink hover:bg-white/[0.1] transition-colors ${className}`}
      {...rest}
    >
      {label}
      <X size={14} weight="bold" aria-hidden="true" className="text-ink-soft" />
    </button>
  );
}

export default Chip;
