import React, { useState } from 'react';
import { Copy, Check } from '@phosphor-icons/react';

// Copies text to the clipboard and says so. When the browser refuses, it says
// that too and hands the text to onFail, so the caller can show it to select.
export default function CopyButton({ text, label = 'Copy', ariaLabel, onFail, className = '' }) {
  const [state, setState] = useState('idle'); // idle | copied | failed
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 1500);
    } catch {
      setState('failed');
      onFail?.(text);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={ariaLabel || label}
      className={`press flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-2xl border border-line text-[13px] font-medium text-ink-soft hover:text-ink ${className}`}
    >
      {state === 'copied' ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
      <span>{state === 'copied' ? 'Copied' : state === 'failed' ? (onFail ? 'Select it below' : 'Copy failed') : label}</span>
    </button>
  );
}
