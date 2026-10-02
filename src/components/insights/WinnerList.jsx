import React from 'react';
import { Link } from 'react-router-dom';
import { Meta, StatusDot } from '@/components/ui';
import { isRunning, winnerProof } from '@/lib/dashboard';
import { angleLabel, angleOf } from '@/lib/angles';

// Every winner as a row: the hook, then brand, proof and angle, and whether it
// still runs (a white dot and "Live", or a ring and "Stopped"). Each row opens
// the ad.
export default function WinnerList({ ads = [] }) {
  if (!ads.length) return null;
  return (
    <ul className="divide-y divide-line">
      {ads.map((ad) => {
        const live = isRunning(ad);
        const angle = angleOf(ad);
        return (
          <li key={ad.id}>
            <Link
              to={`/ad/${ad.id}`}
              className="press flex items-start gap-3 min-h-[56px] py-2.5 -mx-2 px-2 rounded-xl hover:bg-white/[0.03] transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-ui text-ink line-clamp-2">{ad.hook || 'Untitled'}</span>
                <Meta
                  className="block mt-1 text-small text-ink-soft"
                  items={[ad.brand, winnerProof(ad), angle && angleLabel(angle)]}
                />
              </span>
              <StatusDot tone={live ? 'live' : 'stopped'} className="flex-shrink-0 mt-0.5">
                {live ? 'Live' : 'Stopped'}
              </StatusDot>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
