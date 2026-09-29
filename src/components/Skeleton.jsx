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

// A stat-tile-shaped skeleton, matching StatCard's footprint.
export function StatSkeleton() {
  return (
    <div className="bg-card rounded-xl3 shadow-card p-5">
      <Skeleton className="w-10 h-10 rounded-xl mb-3" />
      <Skeleton className="w-20 h-7 mb-2" />
      <Skeleton className="w-16 h-3" />
    </div>
  );
}

// An ad card on its way: brand, two lines of hook, the verdict row and the
// three numbers, in the places AdCard puts them.
export function CardSkeleton() {
  return (
    <div className="bg-card rounded-xl3 shadow-card px-4 pt-4 pb-4 flex flex-col min-h-[208px]">
      <Skeleton className="w-24 h-3" />
      <Skeleton className="w-full h-4 mt-3" />
      <Skeleton className="w-3/4 h-4 mt-2" />
      <div className="flex gap-2 mt-4">
        <Skeleton className="w-16 h-5 rounded-full" />
        <Skeleton className="w-12 h-5" />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-auto pt-4">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    </div>
  );
}

// A list of text rows on their way (hooks, briefs, notes).
export function RowsSkeleton({ rows = 4, className = '' }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-busy="true">
      <span className="sr-only">Loading...</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bg-card rounded-xl3 shadow-card px-4 py-4">
          <Skeleton className={`h-4 ${i % 2 ? 'w-2/3' : 'w-5/6'}`} />
          <Skeleton className="w-24 h-3 mt-3" />
        </div>
      ))}
    </div>
  );
}
