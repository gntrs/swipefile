import React from 'react';

// Monochrome shimmer placeholder. A moving light sweep over a dark block, so
// loading reads as "content on the way" instead of a dead "Loading..." string.
export function Skeleton({ className = '' }) {
  return (
    <div
      className={`rounded-lg bg-white/[0.05] bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,0.07)_50%,transparent_70%)] bg-[length:220%_100%] animate-shimmer ${className}`}
    />
  );
}

// A stat-tile-shaped skeleton, matching StatCard's footprint.
export function StatSkeleton() {
  return (
    <div className="bg-card rounded-xl3 border border-line shadow-card p-5">
      <Skeleton className="w-10 h-10 rounded-2xl mb-3" />
      <Skeleton className="w-20 h-7 mb-2" />
      <Skeleton className="w-16 h-3" />
    </div>
  );
}
