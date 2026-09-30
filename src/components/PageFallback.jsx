import React from 'react';
import { Skeleton, CardSkeleton } from '@/components/Skeleton';

// Shown for the moment a page's code is loading. Quiet on purpose: a title
// and a few cards in the page's usual place.
export default function PageFallback() {
  return (
    <div className="px-5 sm:px-8 pt-6 sm:pt-8 max-w-[1220px] mx-auto" aria-busy="true" aria-label="Loading">
      <Skeleton className="w-44 h-8" />
      <Skeleton className="w-32 h-3 mt-3 mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 min-[1360px]:grid-cols-4 gap-3 sm:gap-4">
        <CardSkeleton />
        <div className="hidden md:block">
          <CardSkeleton />
        </div>
        <div className="hidden lg:block">
          <CardSkeleton />
        </div>
        <div className="hidden min-[1360px]:block">
          <CardSkeleton />
        </div>
      </div>
    </div>
  );
}
