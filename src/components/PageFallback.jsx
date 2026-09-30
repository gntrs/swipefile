import React from 'react';
import { Skeleton, CardSkeleton } from '@/components/Skeleton';
import Page from '@/components/ui/Page';
import { GRID_CARDS } from '@/components/ui/layout';

// Shown for the moment a page's code is loading. Quiet on purpose: a title
// and a few cards in the page's usual place. No page id: the probe waits for
// the real page's data-page, never for this.
export default function PageFallback() {
  return (
    <Page aria-busy="true" aria-label="Loading">
      <div className="mb-6 lg:mb-8">
        <Skeleton className="w-44 h-8" />
        <Skeleton className="w-64 max-w-full h-4 mt-3" />
      </div>
      <div className={GRID_CARDS}>
        <CardSkeleton />
        <div className="hidden md:block">
          <CardSkeleton />
        </div>
        <div className="hidden xl:block">
          <CardSkeleton />
        </div>
        <div className="hidden min-[1800px]:block">
          <CardSkeleton />
        </div>
      </div>
    </Page>
  );
}
