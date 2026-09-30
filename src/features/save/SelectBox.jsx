import React from 'react';
import { Check } from '@phosphor-icons/react';

// A 44px checkbox: the whole square is the target, the drawn box inside is
// small. `label` is read out when there is no visible text next to it.
export default function SelectBox({ checked, onChange, label, className = '', disabled = false }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={`press flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl disabled:opacity-40 ${className}`}
    >
      <span
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
          checked ? 'bg-accent border-accent text-black' : 'border-ink-soft/50 text-transparent'
        }`}
      >
        <Check size={13} weight="bold" />
      </span>
    </button>
  );
}
