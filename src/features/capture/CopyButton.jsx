import React, { useState } from 'react';
import { Copy, Check } from '@phosphor-icons/react';
import { Button } from '@/components/ui';

// Copies text to the clipboard and says so: "Copy", then "Copied". When the
// browser refuses, it says that too and hands the text to onFail, so the
// caller can show it to select.
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
    <Button
      onClick={copy}
      aria-label={ariaLabel || label}
      icon={state === 'copied' ? Check : Copy}
      className={`flex-shrink-0 ${className}`}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? (onFail ? 'Select it below' : 'Copy failed') : label}
    </Button>
  );
}
