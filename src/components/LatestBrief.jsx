import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretRight, FileText } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { shortDate } from '@/features/ai/dates';
import { firstLines, sourceCountText } from '@/features/ai/briefs';

// Newest brief, pinned on the dashboard. Full history at /briefs.
// Renders nothing until the briefs table exists and has a row. Reads every
// column so a database without the newer brief columns still works.
export default function LatestBrief() {
  const [brief, setBrief] = useState(null);

  useEffect(() => {
    let mounted = true;
    db
      .from('briefs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (mounted && data?.[0]) setBrief(data[0]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!brief) return null;
  const sources = sourceCountText(brief);
  const date = shortDate(brief.created_at);

  return (
    <Link
      to={`/briefs?open=${encodeURIComponent(brief.id)}`}
      className="block bg-card rounded-xl3 shadow-card hover:shadow-cardhover transition-all p-5 mb-4"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-7 h-7 rounded-xl bg-accent-wash text-accent-dim flex items-center justify-center flex-shrink-0">
          <FileText size={15} weight="bold" />
        </span>
        <h2 className="font-semibold text-[15px] flex-1 min-w-0 truncate">Latest brief</h2>
        <span className="flex items-center gap-0.5 text-[13px] font-semibold text-accent-dim flex-shrink-0">
          All briefs <CaretRight size={13} weight="bold" />
        </span>
      </div>
      <p className="font-semibold text-[15px] leading-snug">{brief.title}</p>
      <p className="text-[15px] text-ink-soft leading-relaxed mt-1 line-clamp-3 whitespace-pre-wrap">{firstLines(brief.body, 3)}</p>
      <p className="font-mono text-[12px] text-ink-soft mt-2">{[date, sources].filter(Boolean).join(' · ')}</p>
    </Link>
  );
}
