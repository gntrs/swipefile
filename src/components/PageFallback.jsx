import React from 'react';
import { Skeleton } from '@/components/Skeleton';

// Shown for the moment a page's code is loading. Quiet on purpose: a title
// bar and a few blocks in the page's usual place.
export default function PageFallback() {
  return (
    <div className="px-5 sm:px-8 py-6 max-w-[1220px] mx-auto" aria-busy="true" aria-label="Loading">
      <Skeleton className="w-40 h-7 mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40 hidden lg:block" />
        <Skeleton className="h-40 hidden lg:block" />
      </div>
    </div>
  );
}
