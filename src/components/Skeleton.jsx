import React from 'react';

// Monochrome shimmer placeholder. A moving light sweep over a dark block, so
// loading reads as "content on the way" instead of a dead "Loading..." string.
export function Skeleton({ className = '' }) {
  return (
    <div
      className={`rounded-md bg-white/[0.05] bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,0.06)_50%,transparent_70%)] bg-[length:220%_100%] animate-shimmer ${className}`}
    />
  );
}

// A stat tile on its way, in Stat's footprint: the label on top, the number
// at the bottom.
export function StatSkeleton() {
  return (
    <div className="flex flex-col min-h-[7.5rem] bg-card rounded-xl3 p-5 lg:p-6">
      <Skeleton className="w-24 h-3.5" />
      <Skeleton className="w-16 h-8 mt-auto" />
    </div>
  );
}

// An ad card on its way, in AdCard's places: brand, two hook lines, the status
// line, three numbers, and the footer under a hairline.
export function CardSkeleton() {
  return (
    <div className="flex flex-col min-h-[15.5rem] bg-card rounded-xl3">
      <div className="flex flex-1 flex-col px-5 pt-5 pb-4">
        <Skeleton className="w-24 h-3.5" />
        <Skeleton className="w-full h-4 mt-4" />
        <Skeleton className="w-3/4 h-4 mt-2.5" />
        <div className="flex gap-2 mt-4">
          <Skeleton className="w-16 h-6" />
          <Skeleton className="w-24 h-6" />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-auto pt-5">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 min-h-[44px] px-5 border-t border-line">
        <Skeleton className="w-16 h-3.5" />
        <Skeleton className="w-28 h-3.5" />
      </div>
    </div>
  );
}

// Rows on their way (hooks, briefs, notes), inside one panel with hairlines.
export function RowsSkeleton({ rows = 4, className = '' }) {
  return (
    <div className={`bg-card rounded-xl3 divide-y divide-line ${className}`} aria-busy="true">
      <span className="sr-only">Loading...</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col justify-center min-h-[56px] px-5 lg:px-6 py-3.5">
          <Skeleton className={`h-4 ${i % 2 ? 'w-2/3' : 'w-5/6'}`} />
          <Skeleton className="w-28 h-3 mt-2.5" />
        </div>
      ))}
    </div>
  );
}
