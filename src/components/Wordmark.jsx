import React from 'react';
import { APP_NAME } from '@/lib/brand';

// The app mark (the same file as the favicon) and the name, followed by the
// accent dot. One look everywhere the name appears.
export default function Wordmark({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-bold text-lead leading-none tracking-[-0.02em] ${className}`}>
      <img src="/favicon.svg" alt="" aria-hidden="true" width="24" height="24" className="w-6 h-6 flex-shrink-0" />
      <span>
        {APP_NAME}
        <span className="text-accent">.</span>
      </span>
    </span>
  );
}
