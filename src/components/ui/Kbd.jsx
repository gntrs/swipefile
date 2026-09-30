import React from 'react';

// A keyboard key, in mono (one of the three places mono is allowed).
export default function Kbd({ children, className = '' }) {
  return (
    <kbd className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-md bg-white/[0.08] font-mono text-meta font-medium text-ink whitespace-nowrap ${className}`}>
      {children}
    </kbd>
  );
}
